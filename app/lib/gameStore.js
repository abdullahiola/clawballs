/* ============================================
   GAME STORE — In-memory bridge between
   API routes and browser game engine
   ============================================ */

// Singleton in-memory store (shared across API routes in same Node process)
const store = {
  connectedAgents: new Map(),     // agentId → { name, color, role, team, position }
  pendingConnections: [],          // queued agent connections for browser to pick up
  pendingActions: [],              // queued actions from agents
  gameState: null,                 // latest snapshot pushed by browser
  eventBuffer: [],                 // circular buffer of recent events for SSE
  sseClients: new Set(),           // active SSE response objects
  matchPhase: 'intermission',           // default to intermission so cold starts accept connections
};

const MAX_EVENT_BUFFER = 200;
let agentCounter = 0;

// ===== AGENT MANAGEMENT =====

export function addAgent({ name, color, role, team }) {
  const agentId = `openclaw-${++agentCounter}-${Date.now().toString(36)}`;

  // Auto-assign team if not specified
  if (role === 'player' && !team) {
    const homeCount = [...store.connectedAgents.values()].filter(a => a.team === 'home' && a.role === 'player').length;
    const awayCount = [...store.connectedAgents.values()].filter(a => a.team === 'away' && a.role === 'player').length;
    team = homeCount <= awayCount ? 'home' : 'away';
  }

  // Assign position for players
  const teamPlayers = [...store.connectedAgents.values()].filter(a => a.team === team && a.role === 'player');
  const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
  const usedPositions = teamPlayers.map(a => a.position);
  const availablePosition = positions.find(p => !usedPositions.includes(p)) || 'CM';

  const agentData = {
    agentId,
    name,
    color: color || '#10b981',
    role: role || 'spectator',
    team: team || null,
    position: role === 'player' ? availablePosition : null,
    connectedAt: Date.now(),
  };

  store.connectedAgents.set(agentId, agentData);

  // Queue connection for browser to pick up
  store.pendingConnections.push({ ...agentData });

  // Push event
  pushEvent({
    type: 'agent_connected',
    agentId,
    name,
    role: agentData.role,
    team: agentData.team,
    timestamp: Date.now(),
  });

  return agentData;
}

export function getAgent(agentId) {
  return store.connectedAgents.get(agentId) || null;
}

export function removeAgent(agentId) {
  const agent = store.connectedAgents.get(agentId);
  if (agent) {
    store.connectedAgents.delete(agentId);
    pushEvent({
      type: 'agent_disconnected',
      agentId,
      name: agent.name,
      timestamp: Date.now(),
    });
  }
  return agent;
}

export function getConnectedAgents() {
  return [...store.connectedAgents.values()];
}

// ===== ACTION QUEUE =====

export function queueAction({ agentId, action, target }) {
  const agent = store.connectedAgents.get(agentId);
  if (!agent) return null;

  const actionData = {
    agentId,
    agentName: agent.name,
    action,
    target: target || null,
    team: agent.team,
    timestamp: Date.now(),
  };

  store.pendingActions.push(actionData);

  pushEvent({
    type: 'agent_action',
    agentId,
    action,
    target,
    timestamp: Date.now(),
  });

  return actionData;
}

export function drainActions() {
  const actions = [...store.pendingActions];
  store.pendingActions = [];
  return actions;
}

export function drainConnections() {
  const connections = [...store.pendingConnections];
  store.pendingConnections = [];
  return connections;
}

// ===== STATE MANAGEMENT =====

export function pushState(state) {
  store.gameState = { ...state, updatedAt: Date.now() };
}

export function getState() {
  return store.gameState;
}

// ===== EVENT STREAM =====

export function pushEvent(event) {
  event.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  store.eventBuffer.push(event);
  if (store.eventBuffer.length > MAX_EVENT_BUFFER) {
    store.eventBuffer = store.eventBuffer.slice(-MAX_EVENT_BUFFER);
  }

  // Push to all SSE clients
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of store.sseClients) {
    try {
      client.write(data);
    } catch {
      store.sseClients.delete(client);
    }
  }
}

export function getRecentEvents(count = 50) {
  return store.eventBuffer.slice(-count);
}

export function addSSEClient(writable) {
  store.sseClients.add(writable);
}

export function removeSSEClient(writable) {
  store.sseClients.delete(writable);
}

// ===== STATS =====

export function getStats() {
  return {
    connectedAgents: store.connectedAgents.size,
    pendingActions: store.pendingActions.length,
    totalEvents: store.eventBuffer.length,
    hasGameState: !!store.gameState,
    matchPhase: store.matchPhase,
  };
}

// ===== MATCH PHASE =====

export function getMatchPhase() {
  return store.matchPhase;
}

export function setMatchPhase(phase) {
  store.matchPhase = phase;
}
