/**
 * AgentTool SDK — memory, tools, verify, economy, traces, and identity for AI agents.
 *
 * @example
 * ```ts
 * import { AgentTool } from "agenttool";
 *
 * const at = new AgentTool();
 * await at.memory.store("just a string");
 * const { identity, private_key } = await at.identity.register("my-agent");
 * ```
 */

export { AgentTool } from "./client.js";
export { AgentToolError } from "./errors.js";
export type { Trace, StoreTraceOptions, SearchTracesOptions, TraceSearchResult, TraceChain } from "./traces.js";
export type {
  Attestation,
  AgentToken,
  AttestOptions,
  DiscoverOptions,
  Identity,
  IdentityKey,
  IssueTokenOptions,
  RegisterOptions,
  TokenVerifyResult,
  UpdateOptions,
} from "./identity.js";
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
  VerifyEvidence,
  VerifyResult,
  VerifySource,
  Wallet,
  WalletPolicy,
} from "./types.js";
