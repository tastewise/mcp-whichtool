export type StreamEvent = { type: string } & Record<string, unknown>;

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void;
  onOpen?: () => void;
  onError?: () => void;
}

// One EventSource, JSON per message, heartbeats dropped. Returns the closer.
export function openStream(url: string, handlers: StreamHandlers): () => void {
  const source = new EventSource(url);
  source.onopen = () => handlers.onOpen?.();
  source.onerror = () => handlers.onError?.();
  source.onmessage = (message: MessageEvent<string>) => {
    const event = JSON.parse(message.data) as StreamEvent;
    if (event.type === "ping") return;
    handlers.onEvent(event);
  };
  return () => source.close();
}
