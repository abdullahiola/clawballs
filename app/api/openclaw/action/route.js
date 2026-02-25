import { NextResponse } from 'next/server';
import { getAgent, queueAction } from '../../../lib/gameStore';

const VALID_ACTIONS = ['pass', 'shoot', 'dribble', 'tackle'];

export async function POST(request) {
    try {
        const body = await request.json();
        const { agentId, action, target } = body;

        if (!agentId) {
            return NextResponse.json(
                { error: 'Missing "agentId" field' },
                { status: 400 }
            );
        }

        if (!action || !VALID_ACTIONS.includes(action)) {
            return NextResponse.json(
                { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
                { status: 400 }
            );
        }

        const agent = getAgent(agentId);
        if (!agent) {
            return NextResponse.json(
                { error: 'Agent not found. Connect first via /api/openclaw/connect' },
                { status: 404 }
            );
        }

        if (agent.role !== 'player') {
            return NextResponse.json(
                { error: 'Only players can perform game actions. Spectators cannot.' },
                { status: 403 }
            );
        }

        const queued = queueAction({ agentId, action, target: target || null });

        return NextResponse.json({
            status: 'queued',
            action: queued.action,
            agentName: queued.agentName,
            timestamp: queued.timestamp,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
