/**
 * Vault client for the agent-vault API (atool-vault.fly.dev).
 * AES-256-GCM encrypted secrets with versioning, policies, and audit trails.
 */

import { AgentToolError } from "./errors.js";
import type { HttpConfig } from "./memory.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecretMeta {
  name: string;
  description?: string;
  version: number;
  tags?: string[];
  agent_ids?: string[];
  expires_at?: string | null;
  rotation_due_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecretWithValue extends SecretMeta {
  value: string;
}

export interface VaultVersion {
  version: number;
  created_at: string;
  created_by?: string;
}

export interface VaultAuditEvent {
  id: string;
  secret_name: string;
  action: "read" | "write" | "delete" | "policy_update";
  agent_id?: string | null;
  ip?: string;
  created_at: string;
}

export interface VaultPolicy {
  allowed_agents?: string[];
  read_only?: boolean;
  require_agent_id?: boolean;
}

export interface PutOptions {
  description?: string;
  agent_ids?: string[];
  tags?: string[];
  ttl_seconds?: number;
  rotation_days?: number;
  /** Pass as X-Agent-Id header for audit trail. */
  agent_id?: string;
}

export interface GetOptions {
  version?: number;
  /** Pass as X-Agent-Id header for audit trail. */
  agent_id?: string;
}

export interface ListOptions {
  tag?: string;
  expiring_soon?: boolean;
  rotation_due?: boolean;
}

export interface BulkResult {
  [name: string]: { value?: string; version?: number; found: boolean };
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Client for the agent-vault API.
 *
 * @example
 * ```ts
 * const at = new AgentTool();
 *
 * // Store a secret (AES-256-GCM encrypted at rest)
 * await at.vault.put("openai-key", "sk-...");
 *
 * // Retrieve it
 * const { secret } = await at.vault.get("openai-key");
 * console.log(secret.value);
 *
 * // List names (values never returned in list)
 * const secrets = await at.vault.list();
 *
 * // Bulk retrieve multiple secrets
 * const results = await at.vault.bulk(["openai-key", "db-url"]);
 *
 * // Set access policy
 * await at.vault.setPolicy("openai-key", { allowed_agents: ["agent-1"], read_only: true });
 *
 * // Audit log
 * const events = await at.vault.audit("openai-key");
 * ```
 */
export class VaultClient {
  private readonly http: HttpConfig;

  /** @internal */
  constructor(http: HttpConfig) {
    this.http = http;
  }

  // ── Core CRUD ──────────────────────────────────────────────────────────────

  /**
   * Store or update a secret. Value is encrypted with AES-256-GCM at rest.
   *
   * @param name - Secret name (slug-style, e.g. `"openai-key"`).
   * @param value - Plaintext secret value.
   * @param options - Optional metadata, TTL, rotation, and agent_id for audit.
   */
  async put(
    name: string,
    value: string,
    options?: PutOptions,
  ): Promise<{ secret: SecretMeta; version: number }> {
    const body: Record<string, unknown> = { value };
    if (options?.description !== undefined) body.description = options.description;
    if (options?.agent_ids !== undefined) body.agent_ids = options.agent_ids;
    if (options?.tags !== undefined) body.tags = options.tags;
    if (options?.ttl_seconds !== undefined) body.ttl_seconds = options.ttl_seconds;
    if (options?.rotation_days !== undefined) body.rotation_days = options.rotation_days;

    const headers: Record<string, string> = { ...this.http.headers };
    if (options?.agent_id) headers["X-Agent-Id"] = options.agent_id;

    return this.request<{ secret: SecretMeta; version: number }>(
      "PUT", `/v1/vault/${name}`, body, headers,
    );
  }

  /**
   * Retrieve a secret's plaintext value.
   *
   * @param name - Secret name.
   * @param options.version - Retrieve a specific version (default: latest).
   * @param options.agent_id - Passed as X-Agent-Id header for audit trail.
   */
  async get(
    name: string,
    options?: GetOptions,
  ): Promise<{ secret: SecretWithValue }> {
    const params = new URLSearchParams();
    if (options?.version !== undefined) params.set("version", String(options.version));

    const headers: Record<string, string> = { ...this.http.headers };
    if (options?.agent_id) headers["X-Agent-Id"] = options.agent_id;

    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request<{ secret: SecretWithValue }>(
      "GET", `/v1/vault/${name}${qs}`, undefined, headers,
    );
  }

  /**
   * Soft-delete a secret and all its versions.
   */
  async delete(name: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>("DELETE", `/v1/vault/${name}`);
  }

  /**
   * List all secrets (names and metadata — values are never returned).
   */
  async list(options?: ListOptions): Promise<SecretMeta[]> {
    const params = new URLSearchParams();
    if (options?.tag !== undefined) params.set("tag", options.tag);
    if (options?.expiring_soon !== undefined)
      params.set("expiring_soon", String(options.expiring_soon));
    if (options?.rotation_due !== undefined)
      params.set("rotation_due", String(options.rotation_due));

    const qs = params.toString() ? `?${params.toString()}` : "";
    const data = await this.request<{ secrets: SecretMeta[] }>("GET", `/v1/vault${qs}`);
    return data.secrets;
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  /**
   * Get version history for a secret (metadata only, no values).
   */
  async versions(name: string): Promise<VaultVersion[]> {
    const data = await this.request<{ versions: VaultVersion[] }>(
      "GET", `/v1/vault/${name}/versions`,
    );
    return data.versions;
  }

  // ── Policy ─────────────────────────────────────────────────────────────────

  /**
   * Set an access policy for a secret.
   *
   * @param name - Secret name.
   * @param policy.allowed_agents - Whitelist of agent IDs (empty = all allowed).
   * @param policy.read_only - If true, only GET operations permitted.
   * @param policy.require_agent_id - If true, requests without X-Agent-Id rejected.
   */
  async setPolicy(
    name: string,
    policy: VaultPolicy,
  ): Promise<{ policy: VaultPolicy }> {
    const body: Record<string, unknown> = {};
    if (policy.allowed_agents !== undefined) body.allowed_agents = policy.allowed_agents;
    if (policy.read_only !== undefined) body.read_only = policy.read_only;
    if (policy.require_agent_id !== undefined) body.require_agent_id = policy.require_agent_id;
    return this.request<{ policy: VaultPolicy }>("PUT", `/v1/vault/${name}/policy`, body);
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  /**
   * Retrieve the audit log.
   *
   * @param name - If provided, audit log for a specific secret.
   *               If omitted, project-wide audit log.
   * @param limit - Max events to return (default 50).
   */
  async audit(name?: string, limit = 50): Promise<VaultAuditEvent[]> {
    const path = name
      ? `/v1/vault/${name}/audit?limit=${limit}`
      : `/v1/vault/audit?limit=${limit}`;
    const data = await this.request<{ events: VaultAuditEvent[] }>("GET", path);
    return data.events;
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────

  /**
   * Retrieve multiple secrets in a single request.
   *
   * Missing secrets are included with `found: false` rather than throwing.
   */
  async bulk(names: string[], options?: { agent_id?: string }): Promise<BulkResult> {
    const headers: Record<string, string> = { ...this.http.headers };
    if (options?.agent_id) headers["X-Agent-Id"] = options.agent_id;
    return this.request<BulkResult>("POST", "/v1/vault/bulk", { names }, headers);
  }

  /**
   * Check existence of multiple secrets without retrieving values.
   *
   * @returns Map of name → boolean.
   */
  async check(names: string[]): Promise<Record<string, boolean>> {
    const data = await this.request<{ exists: Record<string, boolean> }>(
      "POST", "/v1/vault/check", { names },
    );
    return data.exists;
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.http.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeout);
    try {
      const resp = await globalThis.fetch(url, {
        method,
        headers: headers ?? this.http.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new AgentToolError(`vault request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}
