/**
 * Identity client for the agent-identity API.
 */

import { AgentToolError } from "./errors.js";
import type { HttpConfig } from "./memory.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Identity {
  id: string;
  did: string;
  display_name: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
  status: "active" | "revoked";
  trust_score: number;
  created_at: string;
  updated_at?: string;
}

export interface IdentityKey {
  id: string;
  identity_id: string;
  label: string;
  public_key: string;
  active: boolean;
  created_at: string;
  revoked_at: string | null;
}

export interface Attestation {
  id: string;
  attester_id: string;
  subject_id: string;
  claim: string;
  evidence: string | null;
  weight: number;
  signature: string;
  revoked_at: string | null;
  created_at: string;
}

export interface AgentToken {
  token: string;
  expires_at: string;
}

export interface TokenVerifyResult {
  valid: boolean;
  payload?: {
    sub: string;
    aud?: string;
    exp: number;
    scope?: string[];
    [key: string]: unknown;
  };
  error?: string;
}

export interface RegisterOptions {
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateOptions {
  display_name?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface AttestOptions {
  attester_id: string;
  subject_id: string;
  claim: string;
  private_key: string;
  evidence?: string;
  weight?: number;
}

export interface DiscoverOptions {
  q?: string;
  capability?: string;
  min_trust?: number;
  limit?: number;
}

export interface IssueTokenOptions {
  private_key: string;
  key_id: string;
  ttl_seconds?: number;
  audience?: string;
  scope?: string[];
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Client for the agent-identity API.
 *
 * @example
 * ```ts
 * const at = new AgentTool();
 *
 * // Register a new identity
 * const { identity, private_key } = await at.identity.register("my-agent", {
 *   capabilities: ["search", "code"],
 * });
 *
 * // Attest another agent
 * await at.identity.attest({
 *   attester_id: identity.id,
 *   subject_id: otherId,
 *   claim: "trustworthy",
 *   private_key,
 * });
 *
 * // Discover agents
 * const agents = await at.identity.discover({ capability: "search", min_trust: 0.5 });
 *
 * // Issue a short-lived JWT
 * const { token } = await at.identity.issueToken(identity.id, { private_key, key_id });
 *
 * // Verify a token
 * const result = await at.identity.verifyToken(token);
 * ```
 */
export class IdentityClient {
  private readonly http: HttpConfig;

  /** @internal */
  constructor(http: HttpConfig) {
    this.http = http;
  }

  // ── Identity CRUD ──────────────────────────────────────────────────────────

  /**
   * Register a new agent identity.
   *
   * @returns Object with `identity` and `private_key` (base64 ed25519 — store securely).
   */
  async register(
    display_name: string,
    options?: RegisterOptions,
  ): Promise<{ identity: Identity; private_key: string }> {
    const body: Record<string, unknown> = { display_name };
    if (options?.capabilities !== undefined) body.capabilities = options.capabilities;
    if (options?.metadata !== undefined) body.metadata = options.metadata;
    return this.post<{ identity: Identity; private_key: string }>("/v1/identities", body);
  }

  /**
   * Fetch an identity by UUID or DID.
   */
  async get(identityId: string): Promise<{ identity: Identity }> {
    return this.fetch<{ identity: Identity }>(`/v1/identities/${identityId}`);
  }

  /**
   * Update display name, capabilities, or metadata.
   */
  async update(
    identityId: string,
    options: UpdateOptions,
  ): Promise<{ identity: Identity }> {
    const body: Record<string, unknown> = {};
    if (options.display_name !== undefined) body.display_name = options.display_name;
    if (options.capabilities !== undefined) body.capabilities = options.capabilities;
    if (options.metadata !== undefined) body.metadata = options.metadata;
    return this.patch<{ identity: Identity }>(`/v1/identities/${identityId}`, body);
  }

  /**
   * Soft-revoke an identity.
   */
  async revoke(identityId: string): Promise<{ revoked: boolean }> {
    return this.delete<{ revoked: boolean }>(`/v1/identities/${identityId}`);
  }

  // ── Key Management ─────────────────────────────────────────────────────────

  /**
   * Add a new key to an identity (key rotation).
   *
   * @returns New key and `private_key` — store securely.
   */
  async addKey(
    identityId: string,
    options?: { label?: string },
  ): Promise<{ key: IdentityKey; private_key: string }> {
    return this.post<{ key: IdentityKey; private_key: string }>(
      `/v1/identities/${identityId}/keys`,
      { label: options?.label ?? "rotation" },
    );
  }

  /**
   * List all active keys for an identity.
   */
  async listKeys(identityId: string): Promise<IdentityKey[]> {
    const data = await this.fetch<{ keys: IdentityKey[] }>(
      `/v1/identities/${identityId}/keys`,
    );
    return data.keys;
  }

  /**
   * Revoke a specific key.
   */
  async revokeKey(identityId: string, keyId: string): Promise<{ revoked: boolean }> {
    return this.delete<{ revoked: boolean }>(
      `/v1/identities/${identityId}/keys/${keyId}`,
    );
  }

  // ── Attestations ───────────────────────────────────────────────────────────

  /**
   * Create a signed attestation from one identity to another.
   */
  async attest(options: AttestOptions): Promise<{
    attestation: Attestation;
    subject_trust_score: number;
  }> {
    const body: Record<string, unknown> = {
      attester_id: options.attester_id,
      subject_id: options.subject_id,
      claim: options.claim,
      private_key: options.private_key,
      weight: options.weight ?? 1.0,
    };
    if (options.evidence !== undefined) body.evidence = options.evidence;
    return this.post<{ attestation: Attestation; subject_trust_score: number }>(
      "/v1/attestations",
      body,
    );
  }

  /**
   * Fetch a single attestation by UUID.
   */
  async getAttestation(attestationId: string): Promise<{ attestation: Attestation }> {
    return this.fetch<{ attestation: Attestation }>(
      `/v1/attestations/${attestationId}`,
    );
  }

  /**
   * List attestations for an identity.
   *
   * @param identityId - UUID of the identity.
   * @param options.given - If true, return attestations GIVEN by this identity.
   *                        Default: attestations RECEIVED.
   */
  async listAttestations(
    identityId: string,
    options?: { given?: boolean },
  ): Promise<Attestation[]> {
    const suffix = options?.given ? "/given" : "";
    const data = await this.fetch<{ attestations: Attestation[] }>(
      `/v1/identities/${identityId}/attestations${suffix}`,
    );
    return data.attestations;
  }

  /**
   * Revoke an attestation.
   */
  async revokeAttestation(attestationId: string): Promise<{ revoked: boolean }> {
    return this.delete<{ revoked: boolean }>(`/v1/attestations/${attestationId}`);
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  /**
   * Discover agent identities.
   *
   * @param options.q - Freeform text search on name + metadata.
   * @param options.capability - Filter by a specific capability.
   * @param options.min_trust - Minimum trust score (0.0–1.0).
   * @param options.limit - Max results (default 20).
   */
  async discover(options?: DiscoverOptions): Promise<Identity[]> {
    const params = new URLSearchParams();
    params.set("limit", String(options?.limit ?? 20));
    if (options?.q !== undefined) params.set("q", options.q);
    if (options?.capability !== undefined) params.set("capability", options.capability);
    if (options?.min_trust !== undefined) params.set("min_trust", String(options.min_trust));

    const data = await this.fetch<{ identities: Identity[] }>(
      `/v1/discover?${params.toString()}`,
    );
    return data.identities;
  }

  // ── Agent Tokens ───────────────────────────────────────────────────────────

  /**
   * Issue a short-lived JWT for an agent identity.
   *
   * @param identityId - UUID of the identity.
   * @param options.private_key - Base64-encoded ed25519 private key.
   * @param options.key_id - UUID of the key to sign with.
   * @param options.ttl_seconds - Token TTL (max 3600 / 1 hour). Default 3600.
   * @returns Object with `token` (JWT string) and `expires_at`.
   */
  async issueToken(identityId: string, options: IssueTokenOptions): Promise<AgentToken> {
    const body: Record<string, unknown> = {
      private_key: options.private_key,
      key_id: options.key_id,
      ttl_seconds: options.ttl_seconds ?? 3600,
    };
    if (options.audience !== undefined) body.audience = options.audience;
    if (options.scope !== undefined) body.scope = options.scope;
    return this.post<AgentToken>(`/v1/identities/${identityId}/tokens`, body);
  }

  /**
   * Verify an agent JWT.
   *
   * @returns `valid` (bool) and `payload` (decoded claims) if valid, or `error` if not.
   */
  async verifyToken(token: string): Promise<TokenVerifyResult> {
    return this.post<TokenVerifyResult>("/v1/tokens/verify", { token });
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async fetch<T>(path: string): Promise<T> {
    const url = `${this.http.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeout);
    try {
      const resp = await globalThis.fetch(url, {
        method: "GET",
        headers: this.http.headers,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new AgentToolError(`identity request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.http.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeout);
    try {
      const resp = await globalThis.fetch(url, {
        method: "POST",
        headers: this.http.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new AgentToolError(`identity request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.http.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeout);
    try {
      const resp = await globalThis.fetch(url, {
        method: "PATCH",
        headers: this.http.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new AgentToolError(`identity request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  private async delete<T>(path: string): Promise<T> {
    const url = `${this.http.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeout);
    try {
      const resp = await globalThis.fetch(url, {
        method: "DELETE",
        headers: this.http.headers,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new AgentToolError(`identity request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}
