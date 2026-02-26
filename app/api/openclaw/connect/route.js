import { NextResponse } from 'next/server';
import { getServerEngine } from '../../../lib/serverEngine';

const POSITIONS = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];

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

        const engine = getServerEngine();

        // Only allow connections during intermission lobby
        if (engine.matchPhase === 'playing' || engine.matchPhase === 'fulltime') {
            return NextResponse.json(
                {
                    error: 'Match in progress. Agents can only connect during the intermission lobby.',
                    phase: engine.matchPhase,
                    hint: 'Wait for the current match to end. A 30-second lobby opens between matches.',
                },
                { status: 409 }
            );
        }

        // Auto-assign team if not specified
        let assignedTeam = team || null;
        const assignedRole = role || 'player';
        if (assignedRole === 'player' && !assignedTeam) {
            const homeCount = engine.agents.filter(a => a.team === 'home' && a.isExternal).length;
            const awayCount = engine.agents.filter(a => a.team === 'away' && a.isExternal).length;
            assignedTeam = homeCount <= awayCount ? 'home' : 'away';
        }

        // Find available position
        let assignedPosition = null;
        if (assignedRole === 'player' && assignedTeam) {
            const teamPlayers = engine.agents.filter(a => a.team === assignedTeam && a.isExternal);
            const usedPositions = teamPlayers.map(a => a.position);
            assignedPosition = POSITIONS.find(p => !usedPositions.includes(p)) || 'CM';
        }

        const agentId = `openclaw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        // Add directly to server engine
        engine.addExternalAgent({
            agentId,
            name: name.trim(),
            color: color || '#10b981',
            role: assignedRole,
            team: assignedTeam,
            position: assignedPosition,
        });

        return NextResponse.json({
            agentId,
            name: name.trim(),
            team: assignedTeam,
            position: assignedPosition,
            role: assignedRole,
            status: 'connected',
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
