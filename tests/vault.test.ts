/**
 * Unit tests for VaultClient — all HTTP mocked via global fetch.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { AgentTool, AgentToolError } from "../src/index.js";
import type { SecretMeta, SecretWithValue } from "../src/index.js";

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

const SECRET_META: SecretMeta = {
  name: "openai-key",
  version: 1,
  created_at: "2026-03-17T06:00:00Z",
  updated_at: "2026-03-17T06:00:00Z",
};

const SECRET_VALUE: SecretWithValue = { ...SECRET_META, value: "sk-abc123" };

// ---------------------------------------------------------------------------
// put
// ---------------------------------------------------------------------------

describe("vault.put", () => {
  test("sends value and returns secret + version", async () => {
    setupMock(201, { secret: SECRET_META, version: 1 });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.put("openai-key", "sk-abc123");
    expect(result.version).toBe(1);
    const { method, body, url } = getLastCall();
    expect(method).toBe("PUT");
    expect(body.value).toBe("sk-abc123");
    expect(url).toContain("/v1/vault/openai-key");
  });

  test("sends optional fields", async () => {
    setupMock(201, { secret: SECRET_META, version: 1 });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.put("key", "val", { description: "test", tags: ["ai"], ttl_seconds: 3600 });
    const { body } = getLastCall();
    expect(body.description).toBe("test");
    expect(body.tags).toEqual(["ai"]);
    expect(body.ttl_seconds).toBe(3600);
  });

  test("sends X-Agent-Id header", async () => {
    setupMock(201, { secret: SECRET_META, version: 1 });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.put("key", "val", { agent_id: "agent-1" });
    const { headers } = getLastCall();
    expect((headers as Record<string, string>)["X-Agent-Id"]).toBe("agent-1");
  });

  test("throws on error", async () => {
    setupMock(400, { error: "bad" });
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.vault.put("key", "val")).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("vault.get", () => {
  test("returns secret with value", async () => {
    setupMock(200, { secret: SECRET_VALUE });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.get("openai-key");
    expect(result.secret.value).toBe("sk-abc123");
    expect(getLastCall().method).toBe("GET");
  });

  test("appends version query param", async () => {
    setupMock(200, { secret: SECRET_VALUE });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.get("openai-key", { version: 1 });
    expect(getLastCall().url).toContain("version=1");
  });

  test("sends X-Agent-Id header", async () => {
    setupMock(200, { secret: SECRET_VALUE });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.get("key", { agent_id: "agent-x" });
    const { headers } = getLastCall();
    expect((headers as Record<string, string>)["X-Agent-Id"]).toBe("agent-x");
  });

  test("throws on 404", async () => {
    setupMock(404, {});
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.vault.get("missing")).rejects.toBeInstanceOf(AgentToolError);
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe("vault.delete", () => {
  test("sends DELETE and returns deleted=true", async () => {
    setupMock(200, { deleted: true });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.delete("openai-key");
    expect(result.deleted).toBe(true);
    expect(getLastCall().method).toBe("DELETE");
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("vault.list", () => {
  test("returns secrets array", async () => {
    setupMock(200, { secrets: [SECRET_META] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("openai-key");
  });

  test("passes tag filter", async () => {
    setupMock(200, { secrets: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.list({ tag: "ai" });
    expect(getLastCall().url).toContain("tag=ai");
  });

  test("passes expiring_soon flag", async () => {
    setupMock(200, { secrets: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.list({ expiring_soon: true });
    expect(getLastCall().url).toContain("expiring_soon=true");
  });
});

// ---------------------------------------------------------------------------
// versions
// ---------------------------------------------------------------------------

describe("vault.versions", () => {
  test("returns versions array", async () => {
    setupMock(200, { versions: [{ version: 1, created_at: "2026-03-17T06:00:00Z" }] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.versions("openai-key");
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].version).toBe(1);
    expect(getLastCall().url).toContain("/versions");
  });
});

// ---------------------------------------------------------------------------
// setPolicy
// ---------------------------------------------------------------------------

describe("vault.setPolicy", () => {
  test("sends policy fields", async () => {
    setupMock(200, { policy: { read_only: true } });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.setPolicy("openai-key", { allowed_agents: ["a1"], read_only: true });
    expect(result.policy.read_only).toBe(true);
    const { body, method, url } = getLastCall();
    expect(method).toBe("PUT");
    expect(url).toContain("/policy");
    expect(body.allowed_agents).toEqual(["a1"]);
  });

  test("sends only provided fields", async () => {
    setupMock(200, { policy: {} });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.setPolicy("key", { require_agent_id: true });
    const { body } = getLastCall();
    expect(body.require_agent_id).toBe(true);
    expect(body.allowed_agents).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------

describe("vault.audit", () => {
  test("fetches secret-specific audit log", async () => {
    setupMock(200, { events: [{ action: "read", created_at: "2026-03-17T06:01:00Z" }] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.audit("openai-key");
    expect(Array.isArray(result)).toBe(true);
    expect(getLastCall().url).toContain("/openai-key/audit");
  });

  test("fetches project-wide audit log when name omitted", async () => {
    setupMock(200, { events: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.audit();
    expect(getLastCall().url).toMatch(/\/v1\/vault\/audit/);
  });

  test("passes limit param", async () => {
    setupMock(200, { events: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.audit(undefined, 10);
    expect(getLastCall().url).toContain("limit=10");
  });
});

// ---------------------------------------------------------------------------
// bulk
// ---------------------------------------------------------------------------

describe("vault.bulk", () => {
  test("returns map of name → result", async () => {
    setupMock(200, {
      "openai-key": { value: "sk-abc", version: 1, found: true },
      "missing": { found: false },
    });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.bulk(["openai-key", "missing"]);
    expect(result["openai-key"].found).toBe(true);
    expect(result["missing"].found).toBe(false);
    expect(getLastCall().body.names).toEqual(["openai-key", "missing"]);
  });

  test("sends X-Agent-Id header", async () => {
    setupMock(200, {});
    const at = new AgentTool({ apiKey: "test-key" });
    await at.vault.bulk(["key"], { agent_id: "agent-x" });
    expect((getLastCall().headers as Record<string, string>)["X-Agent-Id"]).toBe("agent-x");
  });
});

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

describe("vault.check", () => {
  test("returns existence map", async () => {
    setupMock(200, { exists: { "openai-key": true, "missing": false } });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.vault.check(["openai-key", "missing"]);
    expect(result["openai-key"]).toBe(true);
    expect(result["missing"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// integration
// ---------------------------------------------------------------------------

describe("client.vault property", () => {
  test("returns VaultClient", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(typeof at.vault.put).toBe("function");
    expect(typeof at.vault.get).toBe("function");
  });

  test("is cached", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(at.vault).toBe(at.vault);
  });
});
