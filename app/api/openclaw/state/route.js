import { NextResponse } from 'next/server';
import { getServerEngine } from '../../../lib/serverEngine';

export async function GET() {
    const engine = getServerEngine();
    const state = engine.getFullState();

    return NextResponse.json({
        matchPhase: state.matchInfo.phase,
        score: state.matchScore,
        ball: state.ball,
        agents: state.agents.map(a => ({
            name: a.name,
            team: a.team,
            position: a.position,
            col: a.col,
            row: a.row,
            hasBall: a.hasBall,
            isExternal: a.isExternal,
        })),
        matchInfo: state.matchInfo,
        stats: state.stats,
        tick: state.tick,
    });
}
