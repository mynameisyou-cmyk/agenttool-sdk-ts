/**
 * Main AgentTool client — the single entry point.
 */

import { AgentToolError } from "./errors.js";
import { EconomyClient } from "./economy.js";
import { MemoryClient, type HttpConfig } from "./memory.js";
import { ToolsClient } from "./tools.js";
import { TracesClient } from "./traces.js";
import { VerifyClient } from "./verify.js";

/**
 * Unified client for the agenttool.dev platform.
 *
 * @example
 * ```ts
 * import { AgentTool } from "agenttool";
 *
 * const at = new AgentTool();                    // reads AT_API_KEY from env
 * await at.memory.store("just a string");        // store a memory
 * const results = await at.memory.search("q");   // semantic search
 * const hits = await at.tools.search("AI news"); // web search
 * const page = await at.tools.scrape("https://x.com"); // scrape
 * const out = await at.tools.execute("print(42)");      // sandbox
 * const v = await at.verify.check("claim");             // verify
 * const w = await at.economy.createWallet({ name: "w" }); // wallet
 * const t = await at.traces.store({ observations: ["saw X"], conclusion: "do Y" }); // trace
 * ```
 */
export class AgentTool {
  private readonly http: HttpConfig;
  private _memory: MemoryClient | undefined;
  private _tools: ToolsClient | undefined;
  private _verify: VerifyClient | undefined;
  private _economy: EconomyClient | undefined;
  private _traces: TracesClient | undefined;

  /**
   * Create a new AgentTool client.
   *
   * @param options - Optional api_key, base_url, timeout.
   */
  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
  }) {
    const resolvedKey =
      options?.apiKey ?? (typeof process !== "undefined" ? process.env.AT_API_KEY : undefined);

    if (!resolvedKey) {
      throw new AgentToolError("No API key provided.", {
        hint: "Pass apiKey in options or set the AT_API_KEY environment variable.",
      });
    }

    this.http = {
      baseUrl: (options?.baseUrl ?? "https://api.agenttool.dev").replace(/\/+$/, ""),
      headers: {
        Authorization: `Bearer ${resolvedKey}`,
        "Content-Type": "application/json",
      },
      timeout: (options?.timeout ?? 30) * 1000, // seconds → ms
    };
  }

  /** Access the Memory API. */
  get memory(): MemoryClient {
    this._memory ??= new MemoryClient(this.http);
    return this._memory;
  }

  /** Access the Tools API (search, scrape, execute). */
  get tools(): ToolsClient {
    this._tools ??= new ToolsClient(this.http);
    return this._tools;
  }

  /** Access the Verify API. */
  get verify(): VerifyClient {
    this._verify ??= new VerifyClient(this.http);
    return this._verify;
  }

  /** Access the Economy/Wallet API. */
  get economy(): EconomyClient {
    this._economy ??= new EconomyClient(this.http);
    return this._economy;
  }

  /** Access the Traces (reasoning provenance) API. */
  get traces(): TracesClient {
    this._traces ??= new TracesClient(this.http);
    return this._traces;
  }

  toString(): string {
    return `AgentTool(baseUrl=${JSON.stringify(this.http.baseUrl)})`;
  }
}
