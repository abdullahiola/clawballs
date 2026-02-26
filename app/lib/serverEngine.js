/* ============================================
   SERVER ENGINE — Authoritative game simulation
   Runs as a Node.js singleton inside Next.js
   ============================================ */

// ===== CONFIG =====
const CONFIG = {
    GRID_SIZE: 50,
    TILE_WIDTH: 44,
    TILE_HEIGHT: 22,
    AGENTS_PER_TEAM: 11,
    FEED_MAX_ITEMS: 80,
    EVENT_INTERVAL: 1600,
    MATCH_DURATION: 5 * 60 * 1000, // 5 minutes
    INTERMISSION_DURATION: 30 * 1000, // 30 seconds
    PITCH: { startRow: 12, endRow: 38, startCol: 12, endCol: 38 },
    STADIUM: { startRow: 8, endRow: 42, startCol: 8, endCol: 42 },
    TEAMS: {
        home: { name: 'Red Claws', colors: ['#ef4444', '#dc2626', '#b91c1c'] },
        away: { name: 'Blue Tide', colors: ['#3b82f6', '#2563eb', '#1d4ed8'] }
    },
    TEAM_POOL: [
        { name: 'Red Claws', colors: ['#ef4444', '#dc2626', '#b91c1c'] },
        { name: 'Blue Tide', colors: ['#3b82f6', '#2563eb', '#1d4ed8'] },
        { name: 'Gold Storm', colors: ['#f59e0b', '#d97706', '#b45309'] },
        { name: 'Emerald FC', colors: ['#10b981', '#059669', '#047857'] },
        { name: 'Purple Reign', colors: ['#8b5cf6', '#7c3aed', '#6d28d9'] },
        { name: 'Pink Phoenix', colors: ['#ec4899', '#db2777', '#be185d'] },
        { name: 'Cyan Sharks', colors: ['#06b6d4', '#0891b2', '#0e7490'] },
        { name: 'Orange Blaze', colors: ['#f97316', '#ea580c', '#c2410c'] },
        { name: 'Lime United', colors: ['#84cc16', '#65a30d', '#4d7c0f'] },
        { name: 'Rose City', colors: ['#f43f5e', '#e11d48', '#be123c'] },
    ],
};

const NAMES_HOME = ['Alpha', 'Bolt', 'Cipher', 'Drift', 'Echo', 'Flare', 'Ghost', 'Hawk', 'Ion', 'Jet', 'Knox'];
const NAMES_AWAY = ['Lynx', 'Maverick', 'Nova', 'Onyx', 'Pulse', 'Quake', 'Razor', 'Storm', 'Titan', 'Ultra', 'Venom'];
const POSITIONS = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t) { return a + (b - a) * t; }
function distBetween(a, b) { return Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2); }
function formatTime() {
    const n = new Date();
    const h = n.getHours() % 12 || 12;
    return `${h}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')} ${n.getHours() >= 12 ? 'PM' : 'AM'}`;
}

// ===== SERVER AGENT =====
class ServerAgent {
    constructor(id, team, namePool, posIndex) {
        this.id = id;
        this.team = team;
        this.name = `${namePool[posIndex]}-${posIndex + 1}`;
        this.position = POSITIONS[posIndex];
        this.color = CONFIG.TEAMS[team].colors[0];
        this.colorDark = CONFIG.TEAMS[team].colors[2];
        const P = CONFIG.PITCH;
        const pitchW = P.endCol - P.startCol;
        const pitchH = P.endRow - P.startRow;

        // 4-4-2 formation
        const formations = {
            GK: { x: 0.04, y: 0.5 },
            LB: { x: 0.18, y: 0.2 },
            CB: { x: 0.15, y: 0.4 },
            'CB2': { x: 0.15, y: 0.6 },
            RB: { x: 0.18, y: 0.8 },
            LM: { x: 0.38, y: 0.15 },
            CM: { x: 0.35, y: 0.4 },
            'CM2': { x: 0.35, y: 0.6 },
            RM: { x: 0.38, y: 0.85 },
            ST: { x: 0.55, y: 0.35 },
            'ST2': { x: 0.55, y: 0.65 },
        };

        let formKey = this.position;
        if (this.position === 'CB' && posIndex === 3) formKey = 'CB2';
        if (this.position === 'CM' && posIndex === 7) formKey = 'CM2';
        if (this.position === 'ST' && posIndex === 10) formKey = 'ST2';
        this.formationKey = formKey;

        const f = formations[formKey] || { x: 0.5, y: 0.5 };

        if (team === 'home') {
            this.homeCol = P.startCol + f.x * pitchW;
            this.homeRow = P.startRow + f.y * pitchH;
        } else {
            this.homeCol = P.endCol - f.x * pitchW;
            this.homeRow = P.startRow + (1 - f.y) * pitchH;
        }

        this.col = this.homeCol;
        this.row = this.homeRow;
        this.targetCol = this.col;
        this.targetRow = this.row;
        this.prevCol = this.col;
        this.prevRow = this.row;
        this.moveProgress = 1;
        this.size = 5.5;
        this.hasBall = false;
        this.state = 'idle';
        this.stateTimer = rand(30, 100);
        this.actionCooldown = 0;
        this.isExternal = false;
        this.externalId = null;
    }

    clamp(c, r) {
        const P = CONFIG.PITCH;
        return {
            col: Math.max(P.startCol + 0.5, Math.min(P.endCol - 0.5, c)),
            row: Math.max(P.startRow + 0.5, Math.min(P.endRow - 0.5, r))
        };
    }

    update(ball, allAgents) {
        const P = CONFIG.PITCH;
        if (this.actionCooldown > 0) this.actionCooldown--;
        this.stateTimer--;
        if (this.hasBall) this.state = 'dribbling';

        // Goalkeeper
        if (this.position === 'GK') {
            if (ball) {
                const goalCol = this.team === 'home' ? P.startCol + 1.5 : P.endCol - 1.5;
                const targetRow = Math.max(P.startRow + (P.endRow - P.startRow) * 0.3,
                    Math.min(P.endRow - (P.endRow - P.startRow) * 0.3,
                        ball.holder ? lerp(ball.holder.prevRow, ball.holder.targetRow, ball.holder.moveProgress) : ball.targetRow));
                if (!this.hasBall) {
                    this.prevCol = this.col; this.prevRow = this.row;
                    this.targetCol = goalCol;
                    this.targetRow = targetRow;
                    this.moveProgress = 0;
                    this.state = 'moving';
                }
            }
            if (this.state === 'moving' || this.state === 'dribbling') {
                this.moveProgress += 0.03;
                if (this.moveProgress >= 1) {
                    this.moveProgress = 1; this.col = this.targetCol; this.row = this.targetRow;
                    this.state = this.hasBall ? 'dribbling' : 'idle'; this.stateTimer = rand(10, 30);
                }
            }
            this.col = lerp(this.prevCol, this.targetCol, this.moveProgress);
            this.row = lerp(this.prevRow, this.targetRow, this.moveProgress);
            return;
        }

        // Outfield players
        const teamHasBall = ball && ball.holder && ball.holder.team === this.team;
        const oppHasBall = ball && ball.holder && ball.holder.team !== this.team;
        const ballCol = ball ? (ball.holder ? lerp(ball.holder.prevCol, ball.holder.targetCol, ball.holder.moveProgress) : ball.targetCol) : this.homeCol;
        const ballRow = ball ? (ball.holder ? lerp(ball.holder.prevRow, ball.holder.targetRow, ball.holder.moveProgress) : ball.targetRow) : this.homeRow;

        if (this.state === 'idle' && this.stateTimer <= 0) {
            let goalCol, goalRow;

            if (teamHasBall && !this.hasBall) {
                const attackDir = this.team === 'home' ? 1 : -1;
                const isDefender = ['LB', 'CB'].includes(this.position);
                const isMidfielder = ['LM', 'CM', 'RM'].includes(this.position);
                const isStriker = this.position === 'ST';

                if (isDefender) {
                    goalCol = this.homeCol + attackDir * 2;
                    goalRow = this.homeRow + (ballRow - this.homeRow) * 0.15;
                } else if (isMidfielder) {
                    goalCol = this.homeCol + attackDir * (3 + Math.random() * 3);
                    goalRow = this.homeRow + (Math.random() - 0.5) * 8;
                    if (Math.random() < 0.3) {
                        const goalTarget = this.team === 'home' ? P.endCol : P.startCol;
                        goalCol = lerp(ballCol, goalTarget, 0.3 + Math.random() * 0.3);
                    }
                } else if (isStriker) {
                    const goalTarget = this.team === 'home' ? P.endCol : P.startCol;
                    goalCol = lerp(ballCol, goalTarget, 0.5 + Math.random() * 0.4);
                    goalRow = this.homeRow + (Math.random() - 0.5) * 10;
                    if (Math.random() < 0.4) {
                        goalRow = ballRow + (Math.random() - 0.5) * 12;
                    }
                } else {
                    goalCol = this.homeCol + rand(-2, 2);
                    goalRow = this.homeRow + rand(-2, 2);
                }
            } else if (oppHasBall) {
                const retreatDir = this.team === 'home' ? -1 : 1;
                const isDefender = ['LB', 'CB'].includes(this.position);
                const isMidfielder = ['LM', 'CM', 'RM'].includes(this.position);

                if (isDefender) {
                    goalCol = this.homeCol + retreatDir * 1;
                    goalRow = this.homeRow + (ballRow - this.homeRow) * 0.25;
                } else if (isMidfielder) {
                    goalCol = this.homeCol + retreatDir * 2;
                    goalRow = this.homeRow + (ballRow - this.homeRow) * 0.2;
                } else {
                    goalCol = this.homeCol;
                    goalRow = this.homeRow + (ballRow - this.homeRow) * 0.15;
                }
            } else {
                goalCol = this.homeCol + rand(-2, 2);
                goalRow = this.homeRow + rand(-2, 2);
            }

            const d = this.clamp(goalCol, goalRow);
            this.prevCol = this.col; this.prevRow = this.row;
            this.targetCol = d.col; this.targetRow = d.row;
            this.moveProgress = 0;
            this.state = 'moving';
            this.stateTimer = rand(40, 100);
        }

        if (this.state === 'moving' || this.state === 'dribbling') {
            let speed = 0.02 + Math.random() * 0.008;
            if (this.hasBall) speed = 0.025;
            if (oppHasBall && distBetween(this, { col: ballCol, row: ballRow }) < 8) speed = 0.035;
            this.moveProgress += speed;
            if (this.moveProgress >= 1) {
                this.moveProgress = 1; this.col = this.targetCol; this.row = this.targetRow;
                this.state = this.hasBall ? 'dribbling' : 'idle'; this.stateTimer = rand(20, 80);
            }
        }

        // Pressing
        if (oppHasBall && !this.hasBall && this.actionCooldown <= 0) {
            const dist = distBetween(this, ball.holder);
            const isDefender = ['LB', 'CB', 'GK'].includes(this.position);
            const pressRange = isDefender ? 6 : (this.position === 'CM' || this.position === 'LM' || this.position === 'RM' ? 7 : 10);
            if (dist < pressRange) {
                this.prevCol = this.col; this.prevRow = this.row;
                const d = this.clamp(ball.holder.col, ball.holder.row);
                this.targetCol = d.col; this.targetRow = d.row;
                this.moveProgress = 0; this.state = 'moving';
            }
        }

        this.col = lerp(this.prevCol, this.targetCol, this.moveProgress);
        this.row = lerp(this.prevRow, this.targetRow, this.moveProgress);
    }

    serialize() {
        return {
            id: this.id,
            team: this.team,
            name: this.name,
            position: this.position,
            color: this.color,
            colorDark: this.colorDark,
            col: this.col,
            row: this.row,
            targetCol: this.targetCol,
            targetRow: this.targetRow,
            prevCol: this.prevCol,
            prevRow: this.prevRow,
            moveProgress: this.moveProgress,
            hasBall: this.hasBall,
            state: this.state,
            isExternal: this.isExternal,
            externalId: this.externalId,
        };
    }
}

// ===== SERVER BALL =====
class ServerBall {
    constructor() {
        const P = CONFIG.PITCH;
        this.col = (P.startCol + P.endCol) / 2;
        this.row = (P.startRow + P.endRow) / 2;
        this.targetCol = this.col;
        this.targetRow = this.row;
        this.holder = null;
        this.free = true;
        this.speed = 0.08;
    }

    update(agents) {
        if (this.holder) {
            const cc = lerp(this.holder.prevCol, this.holder.targetCol, this.holder.moveProgress);
            const cr = lerp(this.holder.prevRow, this.holder.targetRow, this.holder.moveProgress);
            this.targetCol = cc; this.targetRow = cr; this.col = cc; this.row = cr; this.speed = 0.15;
        } else if (this.free) {
            let nearest = null, nd = Infinity;
            for (const a of agents) { const d = distBetween(this, a); if (d < nd) { nd = d; nearest = a; } }
            if (nearest && nd < 2) { this.holder = nearest; nearest.hasBall = true; this.free = false; }
            this.speed = 0.06;
        }
        this.col = lerp(this.col, this.targetCol, this.speed);
        this.row = lerp(this.row, this.targetRow, this.speed);
    }

    passBall(target) {
        if (this.holder) this.holder.hasBall = false;
        this.holder = null; this.free = false;
        this.targetCol = target.col + rand(-1, 1) * 0.5;
        this.targetRow = target.row + rand(-1, 1) * 0.5;
        this.speed = 0.12;
        setTimeout(() => { this.holder = target; target.hasBall = true; this.free = false; }, 600);
    }

    shoot(gc, gr) {
        if (this.holder) this.holder.hasBall = false;
        this.holder = null; this.free = true; this.targetCol = gc; this.targetRow = gr; this.speed = 0.15;
    }

    loose(c, r) {
        if (this.holder) this.holder.hasBall = false;
        this.holder = null; this.free = true;
        this.targetCol = c + rand(-2, 2); this.targetRow = r + rand(-2, 2); this.speed = 0.08;
    }

    resetToCenter() {
        const P = CONFIG.PITCH;
        this.col = (P.startCol + P.endCol) / 2; this.row = (P.startRow + P.endRow) / 2;
        this.targetCol = this.col; this.targetRow = this.row; this.free = true; this.holder = null;
    }

    serialize() {
        return {
            col: this.col,
            row: this.row,
            targetCol: this.targetCol,
            targetRow: this.targetRow,
            holderName: this.holder ? this.holder.name : null,
            holderId: this.holder ? this.holder.id : null,
            free: this.free,
        };
    }
}


// ===== SERVER ENGINE CLASS =====
class ServerEngine {
    constructor() {
        this.agents = [];
        this.ball = null;
        this.tick = 0;
        this.matchScore = { home: 0, away: 0 };
        this.stats = { online: 22, spectators: 0, totalAI: 22, goals: 0, fouls: 0, passes: 0 };
        this.feedItems = [];
        this.lastEventTime = 0;
        this.matchStartTime = 0;
        this.matchTimeRemaining = CONFIG.MATCH_DURATION;
        this.matchNumber = 1;
        this.matchEnded = false;
        this.matchPhase = 'playing';
        this.intermissionEndTime = 0;
        this.nextHomeTeam = null;
        this.nextAwayTeam = null;
        this.lastTimerCheck = 0;
        this.externalAgents = new Map();
        this.externalAgentCount = 0;
        this.tickInterval = null;
        this.sseClients = new Set();
        this.lastBroadcast = 0;

        this._init();
    }

    _init() {
        // Create agents
        for (let i = 0; i < CONFIG.AGENTS_PER_TEAM; i++) {
            this.agents.push(new ServerAgent(i, 'home', NAMES_HOME, i));
        }
        for (let i = 0; i < CONFIG.AGENTS_PER_TEAM; i++) {
            this.agents.push(new ServerAgent(CONFIG.AGENTS_PER_TEAM + i, 'away', NAMES_AWAY, i));
        }
        this.ball = new ServerBall();
        const starter = pick(this.agents);
        this.ball.holder = starter; starter.hasBall = true; this.ball.free = false;

        this.stats.online = this.agents.length;
        this.stats.totalAI = this.agents.length;

        // Run initial gameplay ticks
        for (let i = 0; i < 8; i++) this.doGameplay();
        this.lastEventTime = Date.now();
        this.matchStartTime = Date.now();
        this.matchEnded = false;
        this.lastTimerCheck = Date.now();

        // Start the simulation loop (~60ms = ~16fps for simulation)
        this.tickInterval = setInterval(() => this._tick(), 60);

        console.log('[ServerEngine] Game simulation started');
    }

    destroy() {
        if (this.tickInterval) clearInterval(this.tickInterval);
    }

    // ===== SSE CLIENT MANAGEMENT =====

    addSSEClient(client) {
        this.sseClients.add(client);
    }

    removeSSEClient(client) {
        this.sseClients.delete(client);
    }

    broadcastState() {
        const state = this.getFullState();
        const data = `data: ${JSON.stringify(state)}\n\n`;
        for (const client of this.sseClients) {
            try {
                client.write(data);
            } catch {
                this.sseClients.delete(client);
            }
        }
    }

    // ===== MATCH TIMER =====

    getMatchTime() {
        const elapsed = Date.now() - this.matchStartTime;
        const remaining = Math.max(0, CONFIG.MATCH_DURATION - elapsed);
        const totalSeconds = Math.ceil(remaining / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return { remaining, minutes, seconds, elapsed };
    }

    beginIntermission() {
        this.matchEnded = true;
        this.matchPhase = 'fulltime';

        const winner = this.matchScore.home > this.matchScore.away
            ? CONFIG.TEAMS.home.name
            : this.matchScore.away > this.matchScore.home
                ? CONFIG.TEAMS.away.name
                : null;
        this.addFeed({
            time: formatTime(),
            text: `⏱️ <strong>FULL TIME!</strong> Final score: <strong>${this.matchScore.home} - ${this.matchScore.away}</strong>${winner ? ` — <strong>${winner} win!</strong> 🏆` : ' — Draw!'}`,
            type: 'goals',
        });

        // Pick next teams
        const pool = [...CONFIG.TEAM_POOL];
        const homeIdx = Math.floor(Math.random() * pool.length);
        this.nextHomeTeam = pool.splice(homeIdx, 1)[0];
        const awayIdx = Math.floor(Math.random() * pool.length);
        this.nextAwayTeam = pool.splice(awayIdx, 1)[0];

        this.intermissionEndTime = Date.now() + CONFIG.INTERMISSION_DURATION;
        this.matchPhase = 'intermission';

        this.addFeed({
            time: formatTime(),
            text: `🏟️ <strong>Next up:</strong> <strong>${this.nextHomeTeam.name}</strong> vs <strong>${this.nextAwayTeam.name}</strong> — lobby open for 30s, agents can connect now!`,
            type: 'goals',
        });
    }

    kickOffNewMatch() {
        this.matchNumber++;

        CONFIG.TEAMS.home = { ...this.nextHomeTeam };
        CONFIG.TEAMS.away = { ...this.nextAwayTeam };

        this.matchScore = { home: 0, away: 0 };
        this.stats.goals = 0;
        this.stats.fouls = 0;
        this.stats.passes = 0;

        // Recreate agents
        this.agents = [];
        for (let i = 0; i < CONFIG.AGENTS_PER_TEAM; i++) {
            this.agents.push(new ServerAgent(i, 'home', NAMES_HOME, i));
        }
        for (let i = 0; i < CONFIG.AGENTS_PER_TEAM; i++) {
            this.agents.push(new ServerAgent(CONFIG.AGENTS_PER_TEAM + i, 'away', NAMES_AWAY, i));
        }

        // Re-add external agents
        for (const [agentId, oldAgent] of this.externalAgents) {
            if (oldAgent.isExternal) {
                this.addExternalAgent({
                    agentId,
                    name: oldAgent.name,
                    color: oldAgent.color,
                    role: 'player',
                    team: oldAgent.team,
                    position: oldAgent.position,
                });
            }
        }

        // Reset ball
        this.ball = new ServerBall();
        const starter = pick(this.agents);
        this.ball.holder = starter; starter.hasBall = true; this.ball.free = false;

        this.matchStartTime = Date.now();
        this.matchEnded = false;
        this.matchPhase = 'playing';
        this.lastEventTime = Date.now();

        this.stats.online = this.agents.length;
        this.stats.totalAI = this.agents.length;

        this.addFeed({
            time: formatTime(),
            text: `⚽ <strong>Match ${this.matchNumber}: KICK OFF!</strong> <strong>${this.nextHomeTeam.name}</strong> vs <strong>${this.nextAwayTeam.name}</strong>`,
            type: 'goals',
        });

        this.nextHomeTeam = null;
        this.nextAwayTeam = null;
    }

    // ===== EXTERNAL AGENTS =====

    addExternalAgent(agentData) {
        const { agentId, name, color, role, team, position } = agentData;

        if (role === 'spectator' || !team) {
            this.externalAgentCount++;
            this.addFeed({
                time: formatTime(),
                text: `🤖 <strong>${name}</strong> joined as a spectator! (OpenClaw)`,
                type: 'chat',
            });
            return;
        }

        const posIndex = POSITIONS.indexOf(position) !== -1 ? POSITIONS.indexOf(position) : rand(0, 10);
        const namePool = team === 'home' ? NAMES_HOME : NAMES_AWAY;
        const agent = new ServerAgent(100 + this.agents.length, team, namePool, posIndex);
        agent.name = name;
        agent.color = color || (team === 'home' ? CONFIG.TEAMS.home.colors[0] : CONFIG.TEAMS.away.colors[0]);
        agent.colorDark = agent.color;
        agent.isExternal = true;
        agent.externalId = agentId;

        this.agents.push(agent);
        this.externalAgents.set(agentId, agent);
        this.externalAgentCount++;
        this.stats.online = this.agents.length;
        this.stats.totalAI = this.agents.length;

        this.addFeed({
            time: formatTime(),
            text: `🤖 <strong>${name}</strong> joined as a <strong>${team === 'home' ? CONFIG.TEAMS.home.name : CONFIG.TEAMS.away.name}</strong> player! (OpenClaw)`,
            type: 'chat',
        });
    }

    processAgentAction(actionData) {
        const { agentId, action, target } = actionData;
        const agent = this.externalAgents.get(agentId);
        if (!agent) return;

        const tm = this.agents.filter(a => a.team === agent.team && a.id !== agent.id);
        const P = CONFIG.PITCH;
        const mr = (P.startRow + P.endRow) / 2;

        switch (action) {
            case 'pass': {
                if (!this.ball || !agent.hasBall) break;
                let passTarget;
                if (target) passTarget = this.agents.find(a => a.name === target && a.team === agent.team);
                if (!passTarget && tm.length > 0) passTarget = pick(tm);
                if (passTarget) {
                    this.ball.passBall(passTarget);
                    agent.actionCooldown = 60;
                    this.stats.passes++;
                    this.addFeed({ time: formatTime(), text: `🤖 <strong>${agent.name}</strong> passes to <strong>${passTarget.name}</strong>`, type: 'chat' });
                }
                break;
            }
            case 'shoot': {
                if (!this.ball || !agent.hasBall) break;
                const gc = agent.team === 'home' ? P.endCol : P.startCol;
                this.ball.shoot(gc, mr + rand(-2, 2));
                agent.actionCooldown = 80;
                if (Math.random() < 0.35) {
                    this.matchScore[agent.team]++;
                    this.stats.goals++;
                    this.addFeed({ time: formatTime(), text: `🤖 <strong>${agent.name}</strong> <span class="highlight-goal">scores!</span> ⚽🎉 [${this.matchScore.home}-${this.matchScore.away}]`, type: 'goals' });
                    setTimeout(() => this.ball.resetToCenter(), 2000);
                } else {
                    this.addFeed({ time: formatTime(), text: `🤖 <strong>${agent.name}</strong> shoots — ${pick(['saved by the keeper', 'goes wide', 'hits the post', 'blocked'])}!`, type: 'chat' });
                }
                break;
            }
            case 'dribble': {
                if (!agent.hasBall) break;
                const dc = agent.team === 'home' ? rand(1, 4) : rand(-4, -1);
                const nc = Math.max(P.startCol + 1, Math.min(P.endCol - 1, agent.col + dc));
                const nr = Math.max(P.startRow + 1, Math.min(P.endRow - 1, agent.row + rand(-2, 2)));
                agent.prevCol = agent.col; agent.prevRow = agent.row;
                agent.targetCol = nc; agent.targetRow = nr;
                agent.moveProgress = 0; agent.state = 'dribbling';
                this.addFeed({ time: formatTime(), text: `🤖 <strong>${agent.name}</strong> dribbles forward`, type: 'chat' });
                break;
            }
            case 'tackle': {
                if (!this.ball?.holder || this.ball.holder.team === agent.team) break;
                const ballHolder = this.ball.holder;
                if (distBetween(agent, ballHolder) < 6) {
                    if (Math.random() < 0.5) {
                        this.ball.loose(ballHolder.col, ballHolder.row);
                        agent.actionCooldown = 40;
                        this.addFeed({ time: formatTime(), text: `🤖 <strong>${agent.name}</strong> tackles <strong>${ballHolder.name}</strong> cleanly! 💪`, type: 'chat' });
                    } else {
                        this.addFeed({ time: formatTime(), text: `🤖 <strong>${agent.name}</strong> attempts tackle on <strong>${ballHolder.name}</strong> — missed!`, type: 'chat' });
                    }
                }
                break;
            }
        }
    }

    // ===== FEED =====

    addFeed(item) {
        item.id = Date.now() + Math.random();
        this.feedItems.unshift(item);
        if (this.feedItems.length > CONFIG.FEED_MAX_ITEMS) this.feedItems.pop();
    }

    // ===== SHOT RESOLUTION =====

    attemptShot(shooter, shotType) {
        const P = CONFIG.PITCH;
        const mr = (P.startRow + P.endRow) / 2;
        const gc = shooter.team === 'home' ? P.endCol : P.startCol;
        const dtg = Math.abs(shooter.col - gc);

        this.ball.shoot(gc, mr + rand(-2, 2));
        shooter.actionCooldown = 80;

        const oppGK = this.agents.find(a => a.team !== shooter.team && a.position === 'GK');

        let goalChance;
        if (shotType === 'longrange') {
            goalChance = 0.06;
        } else if (dtg < 4) {
            goalChance = 0.22;
        } else if (dtg < 7) {
            goalChance = 0.14;
        } else if (dtg < 10) {
            goalChance = 0.09;
        } else {
            goalChance = 0.05;
        }

        if (oppGK) {
            const gkDistToGoalLine = Math.abs(oppGK.col - gc);
            const gkCenteredBonus = 1 - Math.min(Math.abs(oppGK.row - mr) / 8, 0.6);
            if (gkDistToGoalLine < 3) {
                goalChance *= (0.5 + (1 - gkCenteredBonus) * 0.5);
            }
        }

        const shotRoll = Math.random();
        if (shotRoll < goalChance) {
            this.matchScore[shooter.team]++;
            this.stats.goals++;
            const goalTypes = ['goal', 'screamer', 'header', 'volley', 'curler', 'chip', 'tap-in', 'rocket'];
            const gt = pick(goalTypes);
            this.addFeed({
                time: formatTime(),
                text: `<strong>${shooter.name}</strong> <span class="highlight-goal">scores a ${gt}!</span> ⚽🎉 [${this.matchScore.home}-${this.matchScore.away}]`,
                type: 'goals',
            });
            setTimeout(() => this.ball.resetToCenter(), 2000);
        } else {
            const saveChance = oppGK ? 0.5 : 0.1;
            if (Math.random() < saveChance && oppGK) {
                const saves = ['saved by the keeper', 'great save!', 'keeper tips it over', 'keeper dives to save', 'keeper holds on'];
                this.addFeed({ time: formatTime(), text: `<strong>${shooter.name}</strong> shoots — <strong>${oppGK.name}</strong> ${pick(saves)} 🧤`, type: 'chat' });
            } else {
                const misses = ['goes wide', 'hits the post', 'blocked by a defender', 'sails over the bar', 'scuffs the shot'];
                this.addFeed({ time: formatTime(), text: `<strong>${shooter.name}</strong> shoots — ${pick(misses)}!`, type: 'chat' });
            }
        }
    }

    // ===== GAMEPLAY =====

    doGameplay() {
        if (!this.ball?.holder) return;
        const h = this.ball.holder;
        const P = CONFIG.PITCH;
        const mr = (P.startRow + P.endRow) / 2;
        const gc = h.team === 'home' ? P.endCol : P.startCol;
        const dtg = Math.abs(h.col - gc);
        const tm = this.agents.filter(a => a.team === h.team && a.id !== h.id);
        const opp = this.agents.filter(a => a.team !== h.team);
        const nearestOpp = opp.reduce((cl, o) => distBetween(h, o) < distBetween(h, cl) ? o : cl, opp[0]);
        const oppDist = nearestOpp ? distBetween(h, nearestOpp) : 99;
        const isGK = h.position === 'GK';
        const isDef = ['LB', 'CB'].includes(h.position);
        const isMid = ['LM', 'CM', 'RM'].includes(h.position);
        const isST = h.position === 'ST';

        // Goalkeeper distribute
        if (isGK) {
            const targets = tm.filter(a => ['LB', 'CB', 'CM'].includes(a.position));
            const t = targets.length > 0 ? targets[rand(0, targets.length - 1)] : pick(tm);
            this.ball.passBall(t); h.actionCooldown = 80; this.stats.passes++;
            this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> distributes to <strong>${t.name}</strong> 🧤`, type: 'chat' });
            return;
        }

        // Under heavy pressure
        if (oppDist < 3 && !isST) {
            const openTm = tm.filter(a => {
                const nearOpp = opp.reduce((cl, o) => distBetween(a, o) < distBetween(a, cl) ? o : cl, opp[0]);
                return distBetween(a, nearOpp) > 3;
            });
            if (openTm.length > 0) {
                const t = openTm.reduce((best, a) => distBetween(h, a) < distBetween(h, best) ? a : best, openTm[0]);
                this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> plays a quick pass to <strong>${t.name}</strong> under pressure`, type: 'chat' });
            } else {
                const dir = h.team === 'home' ? 1 : -1;
                const nc = Math.max(P.startCol + 1, Math.min(P.endCol - 1, h.col + dir * rand(1, 2)));
                const nr = Math.max(P.startRow + 1, Math.min(P.endRow - 1, h.row + rand(-2, 2)));
                h.prevCol = h.col; h.prevRow = h.row;
                h.targetCol = nc; h.targetRow = nr; h.moveProgress = 0; h.state = 'dribbling';
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> tries to dribble away from <strong>${nearestOpp.name}</strong>`, type: 'chat' });
            }
            return;
        }

        // Tackle attempt
        if (oppDist < 5 && Math.random() < 0.3) {
            if (Math.random() < 0.45) {
                this.ball.loose(h.col, h.row); nearestOpp.actionCooldown = 40;
                this.addFeed({ time: formatTime(), text: `<strong>${nearestOpp.name}</strong> tackles <strong>${h.name}</strong> cleanly! 💪`, type: 'chat' });
                if (Math.random() < 0.2) {
                    this.stats.fouls++;
                    this.addFeed({ time: formatTime(), text: `<strong>${nearestOpp.name}</strong> <span class="highlight-foul">fouls</span> <strong>${h.name}</strong> 🟨`, type: 'fouls' });
                }
            } else {
                this.addFeed({ time: formatTime(), text: `<strong>${nearestOpp.name}</strong> attempts tackle on <strong>${h.name}</strong> — missed!`, type: 'chat' });
            }
            return;
        }

        // Position-based decisions
        const roll = Math.random();

        if (isDef) {
            const midTargets = tm.filter(a => ['CM', 'LM', 'RM'].includes(a.position));
            const defTargets = tm.filter(a => ['LB', 'CB', 'RB'].includes(a.position));
            if (roll < 0.5 && midTargets.length > 0) {
                const t = midTargets[rand(0, midTargets.length - 1)];
                this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> plays forward to <strong>${t.name}</strong>`, type: 'chat' });
            } else if (roll < 0.75 && defTargets.length > 0) {
                const t = defTargets[rand(0, defTargets.length - 1)];
                this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> switches play to <strong>${t.name}</strong> ↔️`, type: 'chat' });
            } else {
                const dir = h.team === 'home' ? 1 : -1;
                const nc = Math.max(P.startCol + 1, Math.min(P.endCol - 1, h.col + dir * rand(2, 4)));
                const nr = Math.max(P.startRow + 1, Math.min(P.endRow - 1, h.row + rand(-2, 2)));
                h.prevCol = h.col; h.prevRow = h.row;
                h.targetCol = nc; h.targetRow = nr; h.moveProgress = 0; h.state = 'dribbling';
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> carries the ball forward`, type: 'chat' });
            }
        } else if (isMid) {
            const stTargets = tm.filter(a => a.position === 'ST');
            const midTargets = tm.filter(a => ['CM', 'LM', 'RM'].includes(a.position) && a.id !== h.id);

            if (roll < 0.35 && stTargets.length > 0) {
                const t = stTargets[rand(0, stTargets.length - 1)];
                this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> threads a pass to <strong>${t.name}</strong> ⚡`, type: 'chat' });
            } else if (roll < 0.55 && midTargets.length > 0) {
                const t = midTargets[rand(0, midTargets.length - 1)];
                this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> finds <strong>${t.name}</strong> in space`, type: 'chat' });
            } else if (roll < 0.7 && dtg < 14) {
                this.attemptShot(h, 'longrange');
                return;
            } else {
                const dir = h.team === 'home' ? 1 : -1;
                const nc = Math.max(P.startCol + 1, Math.min(P.endCol - 1, h.col + dir * rand(2, 5)));
                const nr = Math.max(P.startRow + 1, Math.min(P.endRow - 1, h.row + rand(-3, 3)));
                h.prevCol = h.col; h.prevRow = h.row;
                h.targetCol = nc; h.targetRow = nr; h.moveProgress = 0; h.state = 'dribbling';
                const no = opp.find(o => distBetween(h, o) < 4);
                this.addFeed({ time: formatTime(), text: no ? `<strong>${h.name}</strong> dribbles past <strong>${no.name}</strong> 🔥` : `<strong>${h.name}</strong> drives forward`, type: 'chat' });
            }
        } else if (isST) {
            if (dtg < 10 && roll < 0.55) {
                this.attemptShot(h, 'normal');
                return;
            } else if (roll < 0.75) {
                const stPartner = tm.filter(a => a.position === 'ST');
                const midTargets = tm.filter(a => ['CM', 'LM', 'RM'].includes(a.position));
                const targets = stPartner.length > 0 ? stPartner : midTargets;
                if (targets.length > 0) {
                    const t = targets[rand(0, targets.length - 1)];
                    this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                    const isLayoff = stPartner.includes(t);
                    this.addFeed({
                        time: formatTime(), text: isLayoff
                            ? `<strong>${h.name}</strong> lays it off to <strong>${t.name}</strong>`
                            : `<strong>${h.name}</strong> cuts back to <strong>${t.name}</strong>`, type: 'chat'
                    });
                } else {
                    const t = pick(tm);
                    this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
                    this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> passes back to <strong>${t.name}</strong>`, type: 'chat' });
                }
            } else {
                const dir = h.team === 'home' ? 1 : -1;
                const nc = Math.max(P.startCol + 1, Math.min(P.endCol - 1, h.col + dir * rand(2, 5)));
                const nr = Math.max(P.startRow + 1, Math.min(P.endRow - 1, h.row + rand(-2, 2)));
                h.prevCol = h.col; h.prevRow = h.row;
                h.targetCol = nc; h.targetRow = nr; h.moveProgress = 0; h.state = 'dribbling';
                const no = opp.find(o => distBetween(h, o) < 4);
                this.addFeed({ time: formatTime(), text: no ? `<strong>${h.name}</strong> takes on <strong>${no.name}</strong> 🔥` : `<strong>${h.name}</strong> runs at the defense`, type: 'chat' });
            }
        } else {
            const t = pick(tm);
            this.ball.passBall(t); h.actionCooldown = 50; this.stats.passes++;
            this.addFeed({ time: formatTime(), text: `<strong>${h.name}</strong> passes to <strong>${t.name}</strong>`, type: 'chat' });
        }
    }

    // ===== FULL STATE SNAPSHOT =====

    getFullState() {
        const mt = this.getMatchTime();
        return {
            agents: this.agents.map(a => a.serialize()),
            ball: this.ball.serialize(),
            matchScore: { ...this.matchScore },
            stats: { ...this.stats },
            feedItems: this.feedItems.slice(0, 80),
            matchInfo: {
                matchNumber: this.matchNumber,
                homeName: CONFIG.TEAMS.home.name,
                homeColor: CONFIG.TEAMS.home.colors[0],
                awayName: CONFIG.TEAMS.away.name,
                awayColor: CONFIG.TEAMS.away.colors[0],
                minutes: this.matchPhase === 'intermission'
                    ? 0
                    : mt.minutes,
                seconds: this.matchPhase === 'intermission'
                    ? Math.ceil(Math.max(0, this.intermissionEndTime - Date.now()) / 1000)
                    : mt.seconds,
                phase: this.matchPhase,
                nextHomeName: this.nextHomeTeam?.name || null,
                nextHomeColor: this.nextHomeTeam?.colors[0] || null,
                nextAwayName: this.nextAwayTeam?.name || null,
                nextAwayColor: this.nextAwayTeam?.colors[0] || null,
            },
            externalAgentCount: this.externalAgentCount,
            tick: this.tick,
        };
    }

    // ===== MAIN TICK =====

    _tick() {
        this.tick++;

        // Update agents and ball
        for (const a of this.agents) a.update(this.ball, this.agents);
        if (this.ball) this.ball.update(this.agents);

        // Match timer check (~1s interval)
        if (Date.now() - this.lastTimerCheck > 1000) {
            this.lastTimerCheck = Date.now();

            if (this.matchPhase === 'playing') {
                const mt = this.getMatchTime();
                this.matchTimeRemaining = mt.remaining;
                if (mt.remaining <= 0 && !this.matchEnded) {
                    this.beginIntermission();
                }
            } else if (this.matchPhase === 'intermission') {
                const lobbyRemaining = Math.max(0, this.intermissionEndTime - Date.now());
                if (lobbyRemaining <= 0) {
                    this.kickOffNewMatch();
                }
            }
        }

        // Gameplay events
        if (this.matchPhase === 'playing' && !this.matchEnded && Date.now() - this.lastEventTime > CONFIG.EVENT_INTERVAL + rand(-400, 400)) {
            this.doGameplay();
            this.lastEventTime = Date.now();
        }

        // Broadcast state to SSE clients at ~10fps (every 100ms = ~every other tick)
        if (Date.now() - this.lastBroadcast > 100) {
            this.lastBroadcast = Date.now();
            this.broadcastState();
        }
    }
}


// ===== SINGLETON =====
// Use globalThis to survive hot-reloads in development
if (!globalThis.__serverEngine) {
    globalThis.__serverEngine = new ServerEngine();
}

export function getServerEngine() {
    return globalThis.__serverEngine;
}

export { CONFIG as SERVER_CONFIG };
