import { NextResponse } from 'next/server';
import { getState, getConnectedAgents, getRecentEvents } from '../../../lib/gameStore';

export async function GET() {
    const state = getState();
    const agents = getConnectedAgents();
    const recentEvents = getRecentEvents(20);

    return NextResponse.json({
        score: state?.score || { home: 0, away: 0 },
        ballHolder: state?.ballHolder || null,
        agents: agents.map(a => ({
            agentId: a.agentId,
            name: a.name,
            role: a.role,
            team: a.team,
            position: a.position,
        })),
        recentEvents: recentEvents.map(e => ({
            id: e.id,
            type: e.type,
            timestamp: e.timestamp,
            ...e,
        })),
        updatedAt: state?.updatedAt || null,
    });
}
