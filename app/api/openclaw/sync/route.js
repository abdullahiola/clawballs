import { NextResponse } from 'next/server';
import { pushState, pushEvent, drainActions, drainConnections, setMatchPhase } from '../../../lib/gameStore';

export async function POST(request) {
    try {
        const body = await request.json();
        const { state, events, matchPhase } = body;

        // Browser pushes its current game state
        if (state) {
            pushState(state);
        }

        // Browser pushes match phase for connect gating
        if (matchPhase) {
            setMatchPhase(matchPhase);
        }

        // Browser pushes recent events
        if (events && Array.isArray(events)) {
            for (const event of events) {
                pushEvent({
                    type: event.type || 'game_event',
                    text: event.text || '',
                    timestamp: Date.now(),
                    ...event,
                });
            }
        }

        // Return pending connections and actions for browser to process
        const pendingConnections = drainConnections();
        const pendingActions = drainActions();

        return NextResponse.json({
            pendingConnections,
            pendingActions,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
