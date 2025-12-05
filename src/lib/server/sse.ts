const encoder = new TextEncoder();

type SseOptions<T> = {
  producer: () => Promise<T>;
  intervalMs?: number;
  signal?: AbortSignal;
  eventName?: string;
};

export function createSseResponse<T>({ producer, intervalMs = 5000, signal, eventName }: SseOptions<T>) {
  const safeInterval = Number.isFinite(intervalMs) && intervalMs > 500 ? intervalMs : 5000;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const sendPayload = async () => {
        if (closed) return;

        try {
          const payload = await producer();
          const prefix = eventName ? `event: ${eventName}\n` : '';
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(payload)}\n\n`));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error desconocido en SSE';
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`));
        }
      };

      await sendPayload();
      const intervalId = setInterval(sendPayload, safeInterval);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(intervalId);
        try {
          controller.close();
        } catch (error) {
          console.error('[sse] Error al cerrar flujo SSE', error);
        }
      };

      signal?.addEventListener('abort', close);
      controller.oncancel = close;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
