import { beforeEach, describe, expect, it, vi } from "vitest";
import { openStream } from "@/api/sse";
import { FakeEventSource, installFakeEventSource } from "../support/fake-event-source";

describe("openStream", () => {
  beforeEach(installFakeEventSource);
  it("parses events, skips pings, reports open and error, closes", () => {
    const onEvent = vi.fn(); const onOpen = vi.fn(); const onError = vi.fn();
    const close = openStream("/api/events", { onEvent, onOpen, onError });
    const source = FakeEventSource.instances[0]!;
    source.open(); source.emit({ type: "ping", ts: 1 }); source.emit({ type: "state", service: "x" }); source.fail();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "state", service: "x" });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    close();
    expect(source.closed).toBe(true);
  });
});
