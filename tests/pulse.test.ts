/**
 * Unit tests for PulseClient — all HTTP mocked via global fetch.
 */

import { describe, test, expect, afterEach, mock } from "bun:test";
import { AgentTool, AgentToolError } from "../src/index.js";
import type { AgentState } from "../src/index.js";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setupMock(status: number, body: unknown) {
  mockFetch = mock(() => Promise.resolve(mockResponse(status, body)));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

function getLastCall() {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  const url = call[0] as string;
  const init = call[1] as RequestInit;
  return {
    url,
    method: init.method ?? "GET",
    body: init.body ? JSON.parse(init.body as string) : undefined,
    headers: init.headers as Record<string, string>,
  };
}

afterEach(() => { globalThis.fetch = originalFetch; });

const AGENT_STATE: AgentState = {
  agent_id: "agent-1",
  status: "thinking",
  task: "solving math",
  last_seen: "2026-03-22T10:00:00Z",
};

// ---------------------------------------------------------------------------
// heartbeat
// ---------------------------------------------------------------------------

describe("pulse.heartbeat", () => {
  test("sends PUT with status and returns result", async () => {
    setupMock(200, { ok: true, recorded_at: "2026-03-22T10:00:00Z" });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.pulse.heartbeat("agent-1", { status: "thinking" });
    expect(result.ok).toBe(true);
    expect(result.recorded_at).toBe("2026-03-22T10:00:00Z");
    const { method, url, body } = getLastCall();
    expect(method).toBe("PUT");
    expect(url).toContain("/v1/pulse/agent-1");
    expect(body.status).toBe("thinking");
  });

  test("sends optional fields", async () => {
    setupMock(200, { ok: true, recorded_at: "2026-03-22T10:00:00Z" });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.pulse.heartbeat("agent-1", {
      status: "learning",
      task: "reading docs",
      metadata: { progress: 0.5 },
      did: "did:example:123",
    });
    const { body } = getLastCall();
    expect(body.status).toBe("learning");
    expect(body.task).toBe("reading docs");
    expect(body.metadata).toEqual({ progress: 0.5 });
    expect(body.did).toBe("did:example:123");
  });

  test("throws on error", async () => {
    setupMock(400, { error: "bad status" });
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.pulse.heartbeat("agent-1", { status: "thinking" })).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("pulse.get", () => {
  test("returns agent state", async () => {
    setupMock(200, AGENT_STATE);
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.pulse.get("agent-1");
    expect(result.status).toBe("thinking");
    expect(result.agent_id).toBe("agent-1");
    expect(getLastCall().method).toBe("GET");
  });

  test("throws on 404", async () => {
    setupMock(404, {});
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.pulse.get("missing")).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("pulse.list", () => {
  test("returns array of agents", async () => {
    setupMock(200, { agents: [AGENT_STATE] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.pulse.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].agent_id).toBe("agent-1");
    expect(getLastCall().url).toContain("/v1/pulse");
  });

  test("returns empty array when no agents", async () => {
    setupMock(200, { agents: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.pulse.list();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// integration
// ---------------------------------------------------------------------------

describe("client.pulse property", () => {
  test("returns PulseClient", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(typeof at.pulse.heartbeat).toBe("function");
    expect(typeof at.pulse.get).toBe("function");
    expect(typeof at.pulse.list).toBe("function");
  });

  test("is cached", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(at.pulse).toBe(at.pulse);
  });
});
