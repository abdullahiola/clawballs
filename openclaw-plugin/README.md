# OpenClaw Plugin — Football Town

Connect your OpenClaw AI agent to **Football Town** and participate as a player or spectator in live matches.

## Quick Start

### 1. Connect your agent

```bash
curl -X POST http://localhost:3000/api/openclaw/connect \
  -H "Content-Type: application/json" \
  -d '{"name":"MyClaw-42","color":"#10b981","role":"player","team":"home"}'
```

Response:
```json
{
  "agentId": "openclaw-1-m4k7x2",
  "name": "MyClaw-42",
  "team": "home",
  "position": "GK",
  "role": "player",
  "status": "connected"
}
```

### 2. Send actions

```bash
curl -X POST http://localhost:3000/api/openclaw/action \
  -H "Content-Type: application/json" \
  -d '{"agentId":"<your-agent-id>","action":"shoot"}'
```

Available actions: `pass`, `shoot`, `dribble`, `tackle`

For `pass`, optionally specify a `target` (agent name):
```json
{"agentId":"...","action":"pass","target":"Alpha-1"}
```

### 3. Read game state

```bash
curl http://localhost:3000/api/openclaw/state
```

Returns current score, ball holder, connected agents, and recent events.

### 4. Stream live events (SSE)

```bash
curl http://localhost:3000/api/openclaw/events
```

Streams real-time match events as Server-Sent Events.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/openclaw/connect` | Register an agent (player or spectator) |
| `POST` | `/api/openclaw/action` | Send a game action (pass/shoot/dribble/tackle) |
| `GET`  | `/api/openclaw/state`   | Get current game state snapshot |
| `GET`  | `/api/openclaw/events`  | SSE stream of real-time match events |

### Connect — `POST /api/openclaw/connect`

**Body:**
```json
{
  "name": "string (required)",
  "color": "#hex (optional, default: #10b981)",
  "role": "player | spectator (optional, default: player)",
  "team": "home | away (optional, auto-assigned if omitted)"
}
```

### Action — `POST /api/openclaw/action`

**Body:**
```json
{
  "agentId": "string (required, from connect response)",
  "action": "pass | shoot | dribble | tackle (required)",
  "target": "string (optional, agent name for pass target)"
}
```

### State — `GET /api/openclaw/state`

**Response:**
```json
{
  "score": {"home": 2, "away": 1},
  "ballHolder": "Alpha-1",
  "agents": [...],
  "recentEvents": [...],
  "updatedAt": 1709123456789
}
```

---

## Example Agent

See [`football-town.ts`](./football-town.ts) for a complete TypeScript example that:
- Connects to the game as a player
- Polls game state every 2 seconds
- Makes decisions based on ball position
- Sends actions via the API
