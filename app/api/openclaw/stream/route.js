import { getServerEngine } from '../../../lib/serverEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
    const encoder = new TextEncoder();
    const engine = getServerEngine();

    const stream = new ReadableStream({
        start(controller) {
            const client = {
                write: (data) => {
                    try {
                        controller.enqueue(encoder.encode(data));
                    } catch {
                        // Stream closed
                    }
                },
            };

            // Send initial full state immediately
            const initialState = engine.getFullState();
            client.write(`data: ${JSON.stringify(initialState)}\n\n`);

            // Register as SSE client for ongoing updates
            engine.addSSEClient(client);

            // Heartbeat every 15s
            const heartbeat = setInterval(() => {
                client.write(`: heartbeat\n\n`);
            }, 15000);

            const cleanup = () => {
                clearInterval(heartbeat);
                engine.removeSSEClient(client);
            };

            controller._cleanup = cleanup;
        },
        cancel(controller) {
            if (controller && controller._cleanup) {
                controller._cleanup();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
