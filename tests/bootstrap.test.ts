/**
 * Unit tests for BootstrapClient.
 */

import { describe, test, expect, afterEach, mock } from "bun:test";
import { AgentTool, AgentToolError } from "../src/index.js";

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
  return {
    url: call[0] as string,
    method: (call[1] as RequestInit).method ?? "GET",
    body: (call[1] as RequestInit).body
      ? JSON.parse((call[1] as RequestInit).body as string)
      : undefined,
  };
}

afterEach(() => { globalThis.fetch = originalFetch; });

const L0 = {
  agent: { id: "agent-uuid-123", did: "did:at:agent-uuid-123", name: "test-agent", level: 0, capabilities: ["memory"] },
  keypair: { public_key: "pub==", private_key: "priv==" },
  wallet: { id: "wallet-uuid", balance: 0 },
  memory: { namespace: "agent/agent-uuid-123", agent_id: "agent-uuid-123" },
  vault: null, sponsor: null, greeting: null,
  _meta: { level: 0, cost: 5, elevated: false, created_at: "2026-03-17T13:00:00Z" },
};

const ELEVATE = {
  agent_id: "agent-uuid-123", level: 1,
  sponsor: { did: "did:at:sponsor", trust_score: 0.8, attestation_id: "att-uuid" },
  wallet_funded: true, credits_staked: 100, vault_prefix: "agent-uuid-123:",
  new_trust_score: 0.42,
  _meta: { cost: 20, elevated_at: "2026-03-17T13:01:00Z" },
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("bootstrap.create", () => {
  test("sends name and returns L0 response", async () => {
    setupMock(201, L0);
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.bootstrap.create("test-agent");
    expect(result.agent.did).toMatch(/^did:at:/);
    expect(result.keypair.private_key).toBe("priv==");
    expect(result.wallet.id).toBe("wallet-uuid");
    expect(getLastCall().body.name).toBe("test-agent");
  });

  test("sends capabilities", async () => {
    setupMock(201, L0);
    const at = new AgentTool({ apiKey: "test-key" });
    await at.bootstrap.create("agent", { capabilities: ["memory", "verify"] });
    expect(getLastCall().body.capabilities).toEqual(["memory", "verify"]);
  });

  test("sends purpose", async () => {
    setupMock(201, L0);
    const at = new AgentTool({ apiKey: "test-key" });
    await at.bootstrap.create("agent", { purpose: "Find patterns" });
    expect(getLastCall().body.purpose).toBe("Find patterns");
  });

  test("sends generate_greeting flag", async () => {
    setupMock(201, { ...L0, greeting: "I am Agent-7f3a." });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.bootstrap.create("agent", { generate_greeting: true });
    expect(result.greeting).toBe("I am Agent-7f3a.");
    expect(getLastCall().body.generate_greeting).toBe(true);
  });

  test("fires onBirth callback", async () => {
    setupMock(201, L0);
    const at = new AgentTool({ apiKey: "test-key" });
    const births: string[] = [];
    await at.bootstrap.create("agent", { onBirth: (r) => births.push(r.agent.did) });
    expect(births).toEqual(["did:at:agent-uuid-123"]);
  });

  test("onBirth exception does not break bootstrap", async () => {
    setupMock(201, L0);
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.bootstrap.create("agent", {
      onBirth: () => { throw new Error("boom"); },
    });
    expect(result.agent.id).toBe("agent-uuid-123");
  });

  test("throws on error", async () => {
    setupMock(401, { error: "unauthorized" });
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.bootstrap.create("agent")).rejects.toBeInstanceOf(AgentToolError);
  });

  test("posts to /v1/bootstrap", async () => {
    setupMock(201, L0);
    const at = new AgentTool({ apiKey: "test-key" });
    await at.bootstrap.create("agent");
    expect(getLastCall().url).toContain("/v1/bootstrap");
    expect(getLastCall().method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// elevate
// ---------------------------------------------------------------------------

describe("bootstrap.elevate", () => {
  test("sends required fields and returns L1 response", async () => {
    setupMock(200, ELEVATE);
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.bootstrap.elevate({
      agent_id: "agent-uuid-123",
      sponsor_did: "did:at:sponsor",
      sponsor_signature: "privkey==",
    });
    expect(result.level).toBe(1);
    expect(result.wallet_funded).toBe(true);
    expect(result.vault_prefix).toBe("agent-uuid-123:");
    const body = getLastCall().body;
    expect(body.agent_id).toBe("agent-uuid-123");
    expect(body.initial_credits).toBe(100);
  });

  test("sends custom initial_credits", async () => {
    setupMock(200, ELEVATE);
    const at = new AgentTool({ apiKey: "test-key" });
    await at.bootstrap.elevate({ agent_id: "id", sponsor_did: "did:at:s", sponsor_signature: "k==", initial_credits: 500 });
    expect(getLastCall().body.initial_credits).toBe(500);
  });

  test("posts to /elevate", async () => {
    setupMock(200, ELEVATE);
    const at = new AgentTool({ apiKey: "test-key" });
    await at.bootstrap.elevate({ agent_id: "id", sponsor_did: "did:at:s", sponsor_signature: "k==" });
    expect(getLastCall().url).toContain("/elevate");
  });

  test("throws on error", async () => {
    setupMock(400, { error: "insufficient stake" });
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.bootstrap.elevate({ agent_id: "id", sponsor_did: "did:at:s", sponsor_signature: "k==" }))
      .rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

describe("bootstrap.status", () => {
  test("returns L0 status", async () => {
    setupMock(200, { agent: { id: "id", did: "did:at:id", name: "t", level: 0, capabilities: [], trust_score: 0, status: "active" }, sponsor_did: null, elevated_at: null, bootstrapped: true });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.bootstrap.status("id");
    expect(result.agent.level).toBe(0);
    expect(result.bootstrapped).toBe(true);
  });

  test("throws on 404", async () => {
    setupMock(404, {});
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.bootstrap.status("nonexistent")).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// client integration
// ---------------------------------------------------------------------------

describe("client.bootstrap property", () => {
  test("exists and is cached", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(typeof at.bootstrap.create).toBe("function");
    expect(at.bootstrap).toBe(at.bootstrap);
  });
});
