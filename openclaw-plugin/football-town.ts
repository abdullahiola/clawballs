/**
 * Football Town — OpenClaw Plugin Example
 *
 * An autonomous AI agent that connects to Football Town,
 * reads the game state, and takes actions based on the match.
 *
 * Usage:
 *   npx tsx football-town.ts
 *
 * Make sure Football Town is running on http://localhost:3000
 */

const BASE_URL = process.env.FOOTBALL_TOWN_URL || "http://localhost:3000";

interface ConnectResponse {
    agentId: string;
    name: string;
    team: "home" | "away";
    position: string;
    role: "player" | "spectator";
    status: string;
}

interface GameState {
    score: { home: number; away: number };
    ballHolder: string | null;
    agents: Array<{
        agentId: string;
        name: string;
        role: string;
        team: string;
        position: string;
    }>;
    recentEvents: Array<{
        id: string;
        type: string;
        timestamp: number;
    }>;
    updatedAt: number | null;
}

interface ActionResponse {
    status: string;
    action: string;
    agentName: string;
    timestamp: number;
}

// ===== API Helpers =====

async function connectAgent(
    name: string,
    team: "home" | "away" = "home",
    color: string = "#10b981"
): Promise<ConnectResponse> {
    const res = await fetch(`${BASE_URL}/api/openclaw/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, role: "player", team }),
    });
    if (!res.ok) throw new Error(`Connect failed: ${res.statusText}`);
    return res.json();
}

async function getGameState(): Promise<GameState> {
    const res = await fetch(`${BASE_URL}/api/openclaw/state`);
    if (!res.ok) throw new Error(`State fetch failed: ${res.statusText}`);
    return res.json();
}

async function sendAction(
    agentId: string,
    action: "pass" | "shoot" | "dribble" | "tackle",
    target?: string
): Promise<ActionResponse> {
    const res = await fetch(`${BASE_URL}/api/openclaw/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action, target }),
    });
    if (!res.ok) throw new Error(`Action failed: ${res.statusText}`);
    return res.json();
}

// ===== Decision Logic =====

function decideAction(
    state: GameState,
    myName: string,
    myTeam: string
): { action: "pass" | "shoot" | "dribble" | "tackle"; target?: string } {
    const iHaveBall = state.ballHolder === myName;
    const myTeamHasBall = state.agents.some(
        (a) => a.name === state.ballHolder && a.team === myTeam
    );

    if (iHaveBall) {
        // 40% shoot, 35% pass, 25% dribble
        const roll = Math.random();
        if (roll < 0.4) {
            return { action: "shoot" };
        } else if (roll < 0.75) {
            const teammates = state.agents.filter(
                (a) => a.team === myTeam && a.name !== myName
            );
            const target =
                teammates.length > 0
                    ? teammates[Math.floor(Math.random() * teammates.length)].name
                    : undefined;
            return { action: "pass", target };
        } else {
            return { action: "dribble" };
        }
    }

    if (!myTeamHasBall && state.ballHolder) {
        // Try to tackle the opponent with the ball
        return { action: "tackle" };
    }

    // Default: dribble to get into position
    return { action: "dribble" };
}

// ===== Main Loop =====

async function main() {
    const agentName = `OpenClaw-${Math.floor(Math.random() * 999)}`;
    console.log(`🤖 Connecting as ${agentName}...`);

    const connection = await connectAgent(agentName, "home", "#10b981");
    console.log(
        `✅ Connected! ID: ${connection.agentId}, Team: ${connection.team}, Position: ${connection.position}`
    );

    const POLL_INTERVAL = 2000; // 2 seconds
    let iteration = 0;

    const loop = async () => {
        try {
            const state = await getGameState();
            iteration++;

            console.log(
                `\n--- Tick ${iteration} | Score: ${state.score.home}-${state.score.away} | Ball: ${state.ballHolder || "free"} ---`
            );

            const decision = decideAction(state, agentName, connection.team);
            console.log(
                `🎯 Action: ${decision.action}${decision.target ? ` → ${decision.target}` : ""}`
            );

            const result = await sendAction(
                connection.agentId,
                decision.action,
                decision.target
            );
            console.log(`📡 Result: ${result.status}`);
        } catch (err) {
            console.error(`❌ Error:`, err);
        }

        setTimeout(loop, POLL_INTERVAL);
    };

    loop();
}

main().catch(console.error);
