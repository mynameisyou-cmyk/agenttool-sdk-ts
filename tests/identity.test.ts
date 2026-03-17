/**
 * Unit tests for the IdentityClient — all HTTP mocked via global fetch, no network needed.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { AgentTool, AgentToolError } from "../src/index.js";
import type { Identity, Attestation, AgentToken } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getLastCallBody(): Record<string, unknown> {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

function getLastCallUrl(): string {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
}

function getLastCallMethod(): string {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  const init = call[1] as RequestInit;
  return init.method ?? "GET";
}

beforeEach(() => {
  /* noop — each test sets up its own mock */
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const IDENTITY: Identity = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  did: "did:at:550e8400-e29b-41d4-a716-446655440001",
  display_name: "test-agent",
  capabilities: ["search", "code"],
  metadata: {},
  status: "active",
  trust_score: 0,
  created_at: "2026-03-17T04:00:00Z",
};

const ATTESTATION: Attestation = {
  id: "att-uuid-123",
  attester_id: "identity-a",
  subject_id: "identity-b",
  claim: "trustworthy",
  evidence: null,
  weight: 1.0,
  signature: "sig==",
  revoked_at: null,
  created_at: "2026-03-17T04:00:00Z",
};

const TOKEN: AgentToken = {
  token: "eyJhbGciOiJFZERTQSJ9.payload.sig",
  expires_at: "2026-03-17T05:00:00Z",
};

// ---------------------------------------------------------------------------
// Identity CRUD
// ---------------------------------------------------------------------------

describe("identity.register", () => {
  test("sends display_name and returns identity + private_key", async () => {
    setupMock(201, { identity: IDENTITY, private_key: "privkey==" });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.register("test-agent");
    expect(result.identity.did).toMatch(/^did:at:/);
    expect(result.private_key).toBe("privkey==");
    expect(getLastCallBody().display_name).toBe("test-agent");
  });

  test("sends capabilities when provided", async () => {
    setupMock(201, { identity: IDENTITY, private_key: "k==" });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.register("test-agent", { capabilities: ["search", "code"] });
    expect(getLastCallBody().capabilities).toEqual(["search", "code"]);
  });

  test("sends metadata when provided", async () => {
    setupMock(201, { identity: IDENTITY, private_key: "k==" });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.register("test-agent", { metadata: { version: "1.0" } });
    expect(getLastCallBody().metadata).toEqual({ version: "1.0" });
  });

  test("throws AgentToolError on failure", async () => {
    setupMock(400, { error: "bad request" });
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.identity.register("test-agent")).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("identity.get", () => {
  test("fetches by ID", async () => {
    setupMock(200, { identity: IDENTITY });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.get(IDENTITY.id);
    expect(result.identity.id).toBe(IDENTITY.id);
    expect(getLastCallUrl()).toContain(IDENTITY.id);
    expect(getLastCallMethod()).toBe("GET");
  });

  test("throws on 404", async () => {
    setupMock(404, {});
    const at = new AgentTool({ apiKey: "test-key" });
    await expect(at.identity.get("nonexistent")).rejects.toBeInstanceOf(AgentToolError);
  });
});

describe("identity.update", () => {
  test("sends only provided fields", async () => {
    setupMock(200, { identity: IDENTITY });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.update(IDENTITY.id, { capabilities: ["new-cap"] });
    const body = getLastCallBody();
    expect(body.capabilities).toEqual(["new-cap"]);
    expect(body.display_name).toBeUndefined();
    expect(getLastCallMethod()).toBe("PATCH");
  });

  test("sends display_name when provided", async () => {
    setupMock(200, { identity: IDENTITY });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.update(IDENTITY.id, { display_name: "new-name" });
    expect(getLastCallBody().display_name).toBe("new-name");
  });
});

describe("identity.revoke", () => {
  test("sends DELETE and returns revoked", async () => {
    setupMock(200, { revoked: true });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.revoke(IDENTITY.id);
    expect(result.revoked).toBe(true);
    expect(getLastCallMethod()).toBe("DELETE");
  });
});

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

describe("identity.addKey", () => {
  test("posts to keys endpoint with default label", async () => {
    setupMock(201, { key: { id: "key-1", label: "rotation", active: true }, private_key: "newkey==" });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.addKey(IDENTITY.id);
    expect(result.private_key).toBe("newkey==");
    expect(getLastCallBody().label).toBe("rotation");
    expect(getLastCallUrl()).toContain("/keys");
  });

  test("sends custom label", async () => {
    setupMock(201, { key: {}, private_key: "k==" });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.addKey(IDENTITY.id, { label: "device-2" });
    expect(getLastCallBody().label).toBe("device-2");
  });
});

describe("identity.listKeys", () => {
  test("returns keys array", async () => {
    setupMock(200, { keys: [{ id: "key-1", label: "primary", active: true }] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.listKeys(IDENTITY.id);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe("key-1");
  });
});

describe("identity.revokeKey", () => {
  test("sends DELETE to keys endpoint", async () => {
    setupMock(200, { revoked: true });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.revokeKey(IDENTITY.id, "key-1");
    expect(result.revoked).toBe(true);
    expect(getLastCallUrl()).toContain("/keys/key-1");
    expect(getLastCallMethod()).toBe("DELETE");
  });
});

// ---------------------------------------------------------------------------
// Attestations
// ---------------------------------------------------------------------------

describe("identity.attest", () => {
  test("sends required fields and returns attestation", async () => {
    setupMock(201, { attestation: ATTESTATION, subject_trust_score: 0.42 });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.attest({
      attester_id: "identity-a",
      subject_id: "identity-b",
      claim: "trustworthy",
      private_key: "privkey==",
    });
    expect(result.attestation.claim).toBe("trustworthy");
    expect(result.subject_trust_score).toBe(0.42);
    const body = getLastCallBody();
    expect(body.attester_id).toBe("identity-a");
    expect(body.private_key).toBe("privkey==");
    expect(body.weight).toBe(1.0);
  });

  test("sends evidence when provided", async () => {
    setupMock(201, { attestation: ATTESTATION, subject_trust_score: 0.3 });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.attest({
      attester_id: "a",
      subject_id: "b",
      claim: "expert",
      private_key: "k==",
      evidence: "completed 50 tasks",
    });
    expect(getLastCallBody().evidence).toBe("completed 50 tasks");
  });
});

describe("identity.getAttestation", () => {
  test("fetches single attestation", async () => {
    setupMock(200, { attestation: ATTESTATION });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.getAttestation("att-uuid-123");
    expect(result.attestation.id).toBe("att-uuid-123");
    expect(getLastCallUrl()).toContain("/v1/attestations/att-uuid-123");
  });
});

describe("identity.listAttestations", () => {
  test("requests received attestations by default", async () => {
    setupMock(200, { attestations: [ATTESTATION] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.listAttestations(IDENTITY.id);
    expect(Array.isArray(result)).toBe(true);
    expect(getLastCallUrl()).not.toContain("/given");
  });

  test("requests given attestations when given=true", async () => {
    setupMock(200, { attestations: [ATTESTATION] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.listAttestations(IDENTITY.id, { given: true });
    expect(getLastCallUrl()).toContain("/given");
  });
});

describe("identity.revokeAttestation", () => {
  test("sends DELETE", async () => {
    setupMock(200, { revoked: true });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.revokeAttestation("att-uuid-123");
    expect(result.revoked).toBe(true);
    expect(getLastCallMethod()).toBe("DELETE");
  });
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

describe("identity.discover", () => {
  test("returns identities array", async () => {
    setupMock(200, { identities: [IDENTITY] });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.discover();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe(IDENTITY.id);
  });

  test("sends filter params", async () => {
    setupMock(200, { identities: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.discover({ capability: "search", min_trust: 0.5, q: "data" });
    const url = getLastCallUrl();
    expect(url).toContain("capability=search");
    expect(url).toContain("min_trust=0.5");
    expect(url).toContain("q=data");
  });

  test("default limit is 20", async () => {
    setupMock(200, { identities: [] });
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.discover();
    expect(getLastCallUrl()).toContain("limit=20");
  });
});

// ---------------------------------------------------------------------------
// Agent Tokens
// ---------------------------------------------------------------------------

describe("identity.issueToken", () => {
  test("sends required fields and returns token", async () => {
    setupMock(200, TOKEN);
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.issueToken(IDENTITY.id, {
      private_key: "privkey==",
      key_id: "key-uuid",
    });
    expect(result.token).toBe(TOKEN.token);
    expect(result.expires_at).toBe(TOKEN.expires_at);
    const body = getLastCallBody();
    expect(body.private_key).toBe("privkey==");
    expect(body.key_id).toBe("key-uuid");
    expect(body.ttl_seconds).toBe(3600);
  });

  test("sends custom ttl_seconds", async () => {
    setupMock(200, TOKEN);
    const at = new AgentTool({ apiKey: "test-key" });
    await at.identity.issueToken(IDENTITY.id, {
      private_key: "k==",
      key_id: "kid",
      ttl_seconds: 1800,
    });
    expect(getLastCallBody().ttl_seconds).toBe(1800);
  });
});

describe("identity.verifyToken", () => {
  test("returns valid=true with payload", async () => {
    setupMock(200, { valid: true, payload: { sub: IDENTITY.id, exp: 9999999999 } });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.verifyToken("eyJ...");
    expect(result.valid).toBe(true);
    expect(getLastCallBody().token).toBe("eyJ...");
  });

  test("returns valid=false with error", async () => {
    setupMock(200, { valid: false, error: "token expired" });
    const at = new AgentTool({ apiKey: "test-key" });
    const result = await at.identity.verifyToken("expired");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("token expired");
  });
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

describe("client.identity property", () => {
  test("returns IdentityClient", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(at.identity).toBeDefined();
    expect(typeof at.identity.register).toBe("function");
  });

  test("is cached", () => {
    const at = new AgentTool({ apiKey: "test-key" });
    expect(at.identity).toBe(at.identity);
  });
});
