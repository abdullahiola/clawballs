import { NextResponse } from 'next/server';
import { addAgent, getMatchPhase } from '../../../lib/gameStore';

export async function POST(request) {
    try {
        const body = await request.json();
        const { name, color, role, team } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Missing or invalid "name" field' },
                { status: 400 }
            );
        }

        if (role && !['player', 'spectator'].includes(role)) {
            return NextResponse.json(
                { error: 'Role must be "player" or "spectator"' },
                { status: 400 }
            );
        }

        if (team && !['home', 'away'].includes(team)) {
            return NextResponse.json(
                { error: 'Team must be "home" or "away"' },
                { status: 400 }
            );
        }

        // Only allow connections during intermission lobby
        const phase = getMatchPhase();
        if (phase === 'playing' || phase === 'fulltime') {
            return NextResponse.json(
                {
                    error: 'Match in progress. Agents can only connect during the intermission lobby.',
                    phase,
                    hint: 'Wait for the current match to end. A 30-second lobby opens between matches.',
                },
                { status: 409 }
            );
        }

        const agent = addAgent({
            name: name.trim(),
            color: color || '#10b981',
            role: role || 'player',
            team: team || null,
        });

        return NextResponse.json({
            agentId: agent.agentId,
            name: agent.name,
            team: agent.team,
            position: agent.position,
            role: agent.role,
            status: 'connected',
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
