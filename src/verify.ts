/**
 * Verify client for the verification API.
 */

import { AgentToolError } from "./errors.js";
import type { VerifyResult } from "./types.js";
import type { HttpConfig } from "./memory.js";

/**
 * Client for the verify API.
 *
 * @example
 * ```ts
 * const at = new AgentTool();
 * const result = await at.verify.check("The Earth is round");
 * console.log(result.verdict, result.confidence);
 * ```
 */
export class VerifyClient {
  private readonly http: HttpConfig;

  /** @internal */
  constructor(http: HttpConfig) {
    this.http = http;
  }

  /**
   * Verify a claim with AI-powered evidence gathering.
   *
   * @param claim - The statement to verify (max 2000 chars).
   * @param options - Optional context and domain hint.
   * @returns VerifyResult with verdict, confidence, evidence, caveats.
   *
   * @example
   * ```ts
   * const r = await at.verify.check("The Eiffel Tower is 330m tall.", { domain: "general" });
   * console.log(r.verdict, r.confidence); // "disputed" 0.71
   * ```
   */
  async check(claim: string, options?: { context?: string; domain?: "finance" | "legal" | "medical" | "science" | "general" }): Promise<VerifyResult> {
    const body: Record<string, unknown> = { claim };
    if (options?.context !== undefined) body.context = options.context;
    if (options?.domain !== undefined) body.domain = options.domain;

    const url = `${this.http.baseUrl}/v1/verify`;
    const resp = await globalThis.fetch(url, {
      method: "POST",
      headers: this.http.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.http.timeout),
    });

    if (resp.status >= 400) {
      let detail: string;
      try {
        const json = (await resp.json()) as Record<string, unknown>;
        detail = (json.detail as string) ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new AgentToolError(`Verify API error (${resp.status}): ${detail}`, {
        hint: "Check your API key and request parameters.",
      });
    }

    return (await resp.json()) as VerifyResult;
  }

  /**
   * Batch-verify up to 10 claims in parallel.
   *
   * @param claims - Array of claim objects (max 10). Each must include `claim`;
   *   `context` and `domain` are optional per-claim.
   * @returns Array of VerifyResult in the same order as input.
   *
   * @example
   * ```ts
   * const results = await at.verify.batch([
   *   { claim: "The Earth orbits the Sun." },
   *   { claim: "Water boils at 100°C at sea level.", domain: "science" },
   * ]);
   * ```
   */
  async batch(
    claims: Array<{ claim: string; context?: string; domain?: "finance" | "legal" | "medical" | "science" | "general" }>
  ): Promise<VerifyResult[]> {
    const url = `${this.http.baseUrl}/v1/verify/batch`;
    const resp = await globalThis.fetch(url, {
      method: "POST",
      headers: this.http.headers,
      body: JSON.stringify({ claims }),
      signal: AbortSignal.timeout(this.http.timeout),
    });

    if (resp.status >= 400) {
      let detail: string;
      try {
        const json = (await resp.json()) as Record<string, unknown>;
        detail = (json.detail as string) ?? resp.statusText;
      } catch {
        detail = resp.statusText;
      }
      throw new AgentToolError(`Verify API error (${resp.status}): ${detail}`, {
        hint: "Check your API key and request parameters.",
      });
    }

    return (await resp.json()) as VerifyResult[];
  }
}
