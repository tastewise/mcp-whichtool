import { beforeEach, describe, expect, it } from "vitest";
import { LOG_CAP, flushLogs, useLogsStore } from "@/stores/logs.store";

describe("logs.store", () => {
  beforeEach(() => useLogsStore.setState({ buffers: {}, conn: "ok" }));
  it("batches pushes until flush and caps at 600", () => {
    for (let i = 0; i < LOG_CAP + 10; i++) useLogsStore.getState().push("mcp-server", { line: "l" + i });
    expect(useLogsStore.getState().buffers["mcp-server"]).toBeUndefined();
    flushLogs();
    const rows = useLogsStore.getState().buffers["mcp-server"]!;
    expect(rows).toHaveLength(LOG_CAP);
    expect(rows[0]!.line).toBe("l10");
  });
  it("clear empties one key and drops pending writes", () => {
    useLogsStore.getState().push("a", { line: "x" }); flushLogs();
    useLogsStore.getState().push("a", { line: "y" });
    useLogsStore.getState().clear("a");
    flushLogs();
    expect(useLogsStore.getState().buffers["a"]).toEqual([]);
  });
  it("keeps other keys untouched on flush", () => {
    useLogsStore.getState().push("a", { line: "x" }); flushLogs();
    const before = useLogsStore.getState().buffers["a"];
    useLogsStore.getState().push("b", { line: "y" }); flushLogs();
    expect(useLogsStore.getState().buffers["a"]).toBe(before);
  });
});
