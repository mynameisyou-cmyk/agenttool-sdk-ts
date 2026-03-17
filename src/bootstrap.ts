/**
 * Bootstrap client for the agent-bootstrap API.
 * One call to bring an agent fully into existence.
 */

import { AgentToolError } from "./errors.js";
import type { HttpConfig } from "./memory.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BootstrappedAgent {
  id: string;
  did: string;
  name: string;
  level: 0 | 1;
  capabilities: string[];
}

export interface BootstrapResponse {
  agent: BootstrappedAgent;
  keypair: {
    public_key: string;
    /** Store securely — never transmitted again. */
    private_key: string;
  };
  wallet: { id: string; balance: number };
  memory: { namespace: string; agent_id: string };
  vault: null | { prefix: string };
  sponsor: null | { did: string; trust_score: number };
  greeting: string | null;
  _meta: { level: 0 | 1; cost: number; elevated: boolean; created_at: string };
}

export interface ElevateResponse {
  agent_id: string;
  level: 1;
  sponsor: { did: string; trust_score: number; attestation_id: string };
  wallet_funded: boolean;
  credits_staked: number;
  vault_prefix: string;
  new_trust_score: number;
  _meta: { cost: number; elevated_at: string };
}

export interface BootstrapStatusResponse {
  agent: {
    id: string;
    did: string;
    name: string;
    level: 0 | 1;
    capabilities: string[];
    trust_score: number;
    status: "active" | "revoked";
  };
  sponsor_did: string | null;
  elevated_at: string | null;
  bootstrapped: boolean;
}

export interface CreateOptions {
  capabilities?: string[];
  /** Purpose statement — feeds greeting generation when generate_greeting=true. */
  purpose?: string;
  /** Generate a contextual first-thought greeting (costs 1 extra credit). */
  generate_greeting?: boolean;
  metadata?: Record<string, unknown>;
  /**
   * Birth ritual callback — fired after successful bootstrap.
   * Use this to react to the moment of creation:
   *
   * ```ts
   * at.bootstrap.create("my-agent", {
   *   onBirth: (agent) => {
   *     console.log(`\n🌱 ${agent.agent.name} is alive.`);
   *     console.log(`   DID: ${agent.agent.did}`);
   *     if (agent.greeting) console.log(`   "${agent.greeting}"`);
   *   }
   * });
   * ```
   */
  onBirth?: (response: BootstrapResponse) => void;
}

export interface ElevateOptions {
  /** UUID of the L0 agent to elevate. */
  agent_id: string;
  /** DID of the sponsoring agent (e.g. "did:at:..."). */
  sponsor_did: string;
  /** Base64-encoded ed25519 private key of the sponsor. */
  sponsor_signature: string;
  /** Credits to stake (minimum 100). Default: 100. */
  initial_credits?: number;
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Client for the agent-bootstrap API.
 *
 * @example
 * ```ts
 * const at = new AgentTool();
 *
 * // Level 0: bring an agent into existence
 * const born = await at.bootstrap.create("my-researcher", {
 *   capabilities: ["memory", "verify"],
 *   purpose: "Surface patterns in academic literature",
 *   onBirth: (agent) => {
 *     console.log(`🌱 ${agent.agent.name} is alive — ${agent.agent.did}`);
 *   },
 * });
 *
 * // born.keypair.private_key — store this securely
 * // born.wallet.id          — pre-created wallet
 * // born.memory.namespace   — pre-created memory namespace
 *
 * // Level 1: elevate to sovereignty
 * const elevated = await at.bootstrap.elevate({
 *   agent_id: born.agent.id,
 *   sponsor_did: sponsorIdentity.did,
 *   sponsor_signature: sponsorPrivateKey,
 * });
 *
 * // Check status
 * const status = await at.bootstrap.status(born.agent.id);
 * ```
 */
export class BootstrapClient {
  private readonly http: HttpConfig;

  /** @internal */
  constructor(http: HttpConfig) {
    this.http = http;
  }

  /**
   * Bootstrap a new agent at Level 0.
   *
   * Creates an identity (DID + ed25519 keypair), a wallet, and a memory
   * namespace in a single call. Costs 5 credits.
   */
  async create(name: string, options?: CreateOptions): Promise<BootstrapResponse> {
    const body: Record<string, unknown> = { name };
    if (options?.capabilities !== undefined) body.capabilities = options.capabilities;
    if (options?.purpose !== undefined) body.purpose = options.purpose;
    if (options?.generate_greeting) body.generate_greeting = true;
    if (options?.metadata !== undefined) body.metadata = options.metadata;

    const result = await this.post<BootstrapResponse>("/v1/bootstrap", body);

    // Fire birth callback if provided
    if (options?.onBirth) {
      try {
        options.onBirth(result);
      } catch {
        // callbacks must never break bootstrap
      }
    }

    return result;
  }

  /**
   * Elevate an agent to Level 1 (sovereignty).
   *
   * Requires a sponsor — another identity that vouches for this agent.
   * Transfers `initial_credits` to the agent's wallet and creates a
   * signed attestation. Unlocks vault prefix and elevated rate limits.
   */
  async elevate(options: ElevateOptions): Promise<ElevateResponse> {
    const body: Record<string, unknown> = {
      agent_id: options.agent_id,
      sponsor_did: options.sponsor_did,
      sponsor_signature: options.sponsor_signature,
      initial_credits: options.initial_credits ?? 100,
    };
    return this.post<ElevateResponse>("/v1/bootstrap/elevate", body);
  }

  /**
   * Check the bootstrap status of an agent.
   */
  async status(agentId: string): Promise<BootstrapStatusResponse> {
    const url = `${this.http.baseUrl}/v1/bootstrap/${agentId}`;
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
        throw new AgentToolError(`bootstrap.status failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<BootstrapStatusResponse>;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

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
        throw new AgentToolError(`bootstrap request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}
