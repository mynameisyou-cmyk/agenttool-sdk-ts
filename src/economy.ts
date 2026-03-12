/**
 * Economy client for the wallet/escrow API.
 */

import { AgentToolError } from "./errors.js";
import type {
  CreateEscrowOptions,
  CreateWalletOptions,
  Escrow,
  Wallet,
  WalletPolicy,
} from "./types.js";
import type { HttpConfig } from "./memory.js";

/**
 * Client for the agent-economy API — wallets and escrows.
 *
 * @example
 * ```ts
 * const at = new AgentTool();
 *
 * // Create and fund a wallet
 * const wallet = await at.economy.createWallet({ name: "agent-wallet", agentId: "agent-1" });
 * await at.economy.fundWallet(wallet.id, { amount: 500, description: "Weekly budget" });
 *
 * // Create an escrow for agent-to-agent payment
 * const escrow = await at.economy.createEscrow({
 *   creatorWalletId: wallet.id,
 *   amount: 100,
 *   description: "Summarise 50 research papers",
 * });
 * await at.economy.releaseEscrow(escrow.id);
 * ```
 */
export class EconomyClient {
  private readonly http: HttpConfig;

  /** @internal */
  constructor(http: HttpConfig) {
    this.http = http;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private url(path: string): string {
    return `${this.http.baseUrl}${path}`;
  }

  private async req<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    let url = this.url(path);
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url = `${url}?${qs}`;
    }
    const resp = await globalThis.fetch(url, {
      method,
      headers: this.http.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.http.timeout),
    });

    if (resp.status >= 400) {
      let detail: string;
      try {
        const json = (await resp.json()) as Record<string, unknown>;
        detail = (json.detail as string) ?? (json.error as string) ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new AgentToolError(`Economy API error (${resp.status}): ${detail}`, {
        hint: "Check wallet ID, balance, and spending policy.",
      });
    }

    return resp.json() as Promise<T>;
  }

  // ── Wallets ───────────────────────────────────────────────────────────────

  /**
   * Create a new wallet.
   */
  async createWallet(options: CreateWalletOptions): Promise<Wallet> {
    const body: Record<string, unknown> = { name: options.name };
    if (options.agentId) body.agentId = options.agentId;
    if (options.currency) body.currency = options.currency;
    const r = await this.req<{ data: Wallet }>("POST", "/v1/wallets", body);
    return r.data ?? (r as unknown as Wallet);
  }

  /**
   * List all wallets for this project.
   */
  async listWallets(): Promise<Wallet[]> {
    const r = await this.req<{ data: Wallet[] }>("GET", "/v1/wallets");
    return r.data ?? (r as unknown as Wallet[]);
  }

  /**
   * Get a wallet by ID.
   */
  async getWallet(walletId: string): Promise<Wallet> {
    const r = await this.req<{ data: Wallet }>("GET", `/v1/wallets/${walletId}`);
    return r.data ?? (r as unknown as Wallet);
  }

  /**
   * Fund a wallet with credits.
   */
  async fundWallet(
    walletId: string,
    options: { amount: number; description?: string; metadata?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      amount: options.amount,
      description: options.description ?? "Manual fund",
    };
    if (options.metadata) body.metadata = options.metadata;
    return this.req("POST", `/v1/wallets/${walletId}/fund`, body);
  }

  /**
   * Spend credits from a wallet (subject to spending policy).
   */
  async spend(
    walletId: string,
    options: { amount: number; counterparty: string; description: string; metadata?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      amount: options.amount,
      counterparty: options.counterparty,
      description: options.description,
    };
    if (options.metadata) body.metadata = options.metadata;
    return this.req("POST", `/v1/wallets/${walletId}/spend`, body);
  }

  /**
   * Set or update a wallet's spending policy.
   */
  async setPolicy(walletId: string, policy: WalletPolicy): Promise<Record<string, unknown>> {
    return this.req("PUT", `/v1/wallets/${walletId}/policy`, policy);
  }

  /**
   * Freeze a wallet — halts all spending immediately.
   */
  async freezeWallet(walletId: string): Promise<Wallet> {
    const r = await this.req<{ data: Wallet }>("POST", `/v1/wallets/${walletId}/freeze`);
    return r.data ?? (r as unknown as Wallet);
  }

  /**
   * Unfreeze a wallet to resume normal operation.
   */
  async unfreezeWallet(walletId: string): Promise<Wallet> {
    const r = await this.req<{ data: Wallet }>("POST", `/v1/wallets/${walletId}/unfreeze`);
    return r.data ?? (r as unknown as Wallet);
  }

  /**
   * Get paginated transaction history for a wallet.
   */
  async getTransactions(
    walletId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<Record<string, unknown>[]> {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = String(options.limit);
    if (options?.offset) params.offset = String(options.offset);
    const r = await this.req<{ data: Record<string, unknown>[] }>(
      "GET", `/v1/wallets/${walletId}/transactions`, undefined, Object.keys(params).length ? params : undefined,
    );
    return r.data ?? (r as unknown as Record<string, unknown>[]);
  }

  // ── Escrows ───────────────────────────────────────────────────────────────

  /**
   * Create an escrow — locks credits until work is released or refunded.
   */
  async createEscrow(options: CreateEscrowOptions): Promise<Escrow> {
    const body: Record<string, unknown> = {
      creatorWalletId: options.creatorWalletId,
      amount: options.amount,
      description: options.description,
    };
    if (options.workerWalletId) body.workerWalletId = options.workerWalletId;
    if (options.deadline) body.deadline = options.deadline;
    const r = await this.req<{ data: Escrow }>("POST", "/v1/escrows", body);
    return r.data ?? (r as unknown as Escrow);
  }

  /**
   * List escrows, optionally filtered by status.
   */
  async listEscrows(status?: Escrow["status"]): Promise<Escrow[]> {
    const params = status ? { status } : undefined;
    const r = await this.req<{ data: Escrow[] }>("GET", "/v1/escrows", undefined, params);
    return r.data ?? (r as unknown as Escrow[]);
  }

  /**
   * Get an escrow by ID.
   */
  async getEscrow(escrowId: string): Promise<Escrow> {
    const r = await this.req<{ data: Escrow }>("GET", `/v1/escrows/${escrowId}`);
    return r.data ?? (r as unknown as Escrow);
  }

  /**
   * Accept an escrow as the worker.
   */
  async acceptEscrow(escrowId: string, workerWalletId: string): Promise<Escrow> {
    const r = await this.req<{ data: Escrow }>("POST", `/v1/escrows/${escrowId}/accept`, { workerWalletId });
    return r.data ?? (r as unknown as Escrow);
  }

  /**
   * Release escrow funds to the worker.
   */
  async releaseEscrow(escrowId: string): Promise<Escrow> {
    const r = await this.req<{ data: Escrow }>("POST", `/v1/escrows/${escrowId}/release`);
    return r.data ?? (r as unknown as Escrow);
  }

  /**
   * Refund escrow credits back to the creator.
   */
  async refundEscrow(escrowId: string): Promise<Escrow> {
    const r = await this.req<{ data: Escrow }>("POST", `/v1/escrows/${escrowId}/refund`);
    return r.data ?? (r as unknown as Escrow);
  }

  /**
   * Flag an escrow as disputed — credits stay locked pending resolution.
   */
  async disputeEscrow(escrowId: string): Promise<Escrow> {
    const r = await this.req<{ data: Escrow }>("POST", `/v1/escrows/${escrowId}/dispute`);
    return r.data ?? (r as unknown as Escrow);
  }
}
