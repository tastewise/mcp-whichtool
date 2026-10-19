type Listener = ((event: MessageEvent) => void) | null;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static reset() { FakeEventSource.instances = []; }
  readonly url: string;
  closed = false;
  onmessage: Listener = null;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  emit(data: object) { this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) })); }
  open() { this.onopen?.(new Event("open")); }
  fail() { this.onerror?.(new Event("error")); }
  close() { this.closed = true; }
}

export function installFakeEventSource() {
  FakeEventSource.reset();
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
}
