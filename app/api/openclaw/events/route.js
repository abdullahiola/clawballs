import { addSSEClient, removeSSEClient, getRecentEvents } from '../../../lib/gameStore';

export const dynamic = 'force-dynamic';

export async function GET() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Helper to write SSE data
            const write = (data) => {
                try {
                    controller.enqueue(encoder.encode(data));
                } catch {
                    // Stream closed
                }
            };

            // Create a writable shim for the store's SSE client tracking
            const client = {
                write: (data) => write(data),
            };

            // Send initial recent events
            const recent = getRecentEvents(10);
            for (const event of recent) {
                write(`data: ${JSON.stringify(event)}\n\n`);
            }

            // Register as SSE client
            addSSEClient(client);

            // Heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
                write(`: heartbeat\n\n`);
            }, 15000);

            // Cleanup on close — we detect this via the cancel callback
            const cleanup = () => {
                clearInterval(heartbeat);
                removeSSEClient(client);
            };

            // Store cleanup for cancel
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
