import { NextResponse } from 'next/server';
import { getServerEngine } from '../../../lib/serverEngine';

// Repurposed: Returns authoritative server state (polling fallback for SSE)
export async function POST() {
    try {
        const engine = getServerEngine();
        const state = engine.getFullState();
        return NextResponse.json(state);
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to get game state' },
            { status: 500 }
        );
    }
}
