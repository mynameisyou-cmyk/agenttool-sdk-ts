/**
 * AgentTool SDK — memory and tools for AI agents.
 *
 * @example
 * ```ts
 * import { AgentTool } from "agenttool";
 *
 * const at = new AgentTool();
 * await at.memory.store("just a string");
 * ```
 */

export { AgentTool } from "./client.js";
export { AgentToolError } from "./errors.js";
export type { Trace, StoreTraceOptions, SearchTracesOptions, TraceSearchResult, TraceChain } from "./traces.js";
export type {
  CreateEscrowOptions,
  CreateWalletOptions,
  DocumentResult,
  Escrow,
  ExecuteResult,
  ParseDocumentOptions,
  Memory,
  ScrapeResult,
  SearchMemoryOptions,
  SearchResponse,
  SearchResult,
  StoreOptions,
  UsageStats,
  VerifyResult,
  Wallet,
  WalletPolicy,
} from "./types.js";
