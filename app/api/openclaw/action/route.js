import { NextResponse } from 'next/server';
import { getServerEngine } from '../../../lib/serverEngine';

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

        const engine = getServerEngine();
        const agent = engine.externalAgents.get(agentId);

        if (!agent) {
            return NextResponse.json(
                { error: 'Agent not found. Connect first via /api/openclaw/connect' },
                { status: 404 }
            );
        }

        // Process action directly on server engine
        engine.processAgentAction({ agentId, action, target: target || null });

        return NextResponse.json({
            status: 'executed',
            action,
            agentName: agent.name,
            timestamp: Date.now(),
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
