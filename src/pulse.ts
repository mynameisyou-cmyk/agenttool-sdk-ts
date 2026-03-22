/**
 * Pulse client for the agent-pulse API (agent-pulse.fly.dev).
 * Agent presence & liveness tracking.
 */

import { AgentToolError } from "./errors.js";
import type { HttpConfig } from "./memory.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PulseStatus = "idle" | "thinking" | "learning" | "error";

export interface HeartbeatOptions {
  status: PulseStatus;
  task?: string;
  metadata?: Record<string, unknown>;
  did?: string;
}

export interface HeartbeatResult {
  ok: boolean;
  recorded_at: string;
}

export interface AgentState {
  agent_id: string;
  status: PulseStatus;
  task?: string;
  metadata?: Record<string, unknown>;
  did?: string;
  last_seen: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Client for the agent-pulse API — agent presence & liveness tracking.
 *
 * @example
 * ```ts
 * const at = new AgentTool();
 *
 * // Send a heartbeat
 * await at.pulse.heartbeat("agent-1", { status: "thinking", task: "solving math" });
 *
 * // Get agent state
 * const state = await at.pulse.get("agent-1");
 *
 * // List all alive agents
 * const agents = await at.pulse.list();
 * ```
 */
export class PulseClient {
  private readonly http: HttpConfig;

  /** @internal */
  constructor(http: HttpConfig) {
    this.http = http;
  }

  /**
   * Send a heartbeat for an agent.
   *
   * @param agentId - Unique agent identifier.
   * @param options - Status and optional task, metadata, did.
   */
  async heartbeat(agentId: string, options: HeartbeatOptions): Promise<HeartbeatResult> {
    const body: Record<string, unknown> = { status: options.status };
    if (options.task !== undefined) body.task = options.task;
    if (options.metadata !== undefined) body.metadata = options.metadata;
    if (options.did !== undefined) body.did = options.did;

    return this.request<HeartbeatResult>("PUT", `/v1/pulse/${agentId}`, body);
  }

  /**
   * Get the current state of an agent.
   *
   * @param agentId - Unique agent identifier.
   */
  async get(agentId: string): Promise<AgentState> {
    return this.request<AgentState>("GET", `/v1/pulse/${agentId}`);
  }

  /**
   * List all alive agents.
   */
  async list(): Promise<AgentState[]> {
    const data = await this.request<{ agents: AgentState[] }>("GET", "/v1/pulse");
    return data.agents;
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.http.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.http.timeout);
    try {
      const resp = await globalThis.fetch(url, {
        method,
        headers: this.http.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new AgentToolError(`pulse request failed: ${resp.status}`, { hint: text });
      }
      return resp.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}
