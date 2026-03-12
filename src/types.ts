/**
 * Data types for the AgentTool SDK.
 */

/** A stored memory. */
export interface Memory {
  id: string;
  content: string;
  type: string;
  agent_id?: string;
  key?: string;
  metadata: Record<string, unknown>;
  importance: number;
  score?: number;
  created_at?: string;
  updated_at?: string;
}

/** Options for storing a memory. */
export interface StoreOptions {
  type?: string;
  agent_id?: string;
  key?: string;
  metadata?: Record<string, unknown>;
  importance?: number;
}

/** Options for searching memories. */
export interface SearchMemoryOptions {
  limit?: number;
  type?: string;
  agent_id?: string;
}

/** API usage statistics. */
export interface UsageStats {
  writes: number;
  reads: number;
  searches: number;
  total_memories: number;
  plan: string;
}

/** A web search result. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

/** Response from the search endpoint. */
export interface SearchResponse {
  results: SearchResult[];
  cached: boolean;
  duration_ms: number;
}

/** Result of scraping a URL. */
export interface ScrapeResult {
  url: string;
  content: string;
  status_code: number;
  [key: string]: unknown;
}

/** Result of document parsing. */
export interface DocumentResult {
  title: string;
  content: string;
  word_count: number;
  content_type: string;
  metadata: Record<string, unknown>;
  duration_ms: number;
}

/** Options for document parsing. */
export interface ParseDocumentOptions {
  url?: string;
  base64?: string;
  content_type?: string;
}

/** Result of sandboxed code execution. */
export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

/** A single source returned by agent-verify. */
export interface VerifySource {
  url: string;
  title: string;
  date?: string;
  reliability: number;
}

/** Evidence grouped by position. */
export interface VerifyEvidence {
  supporting: Array<{ url: string; title: string; snippet: string; reliability: number }>;
  contradicting: Array<{ url: string; title: string; snippet: string; reliability: number }>;
  neutral: Array<{ url: string; title: string; snippet: string; reliability: number }>;
}

/** Result of a verification request. */
export interface VerifyResult {
  verdict: "verified" | "false" | "disputed" | "unverifiable";
  confidence: number;
  sources: VerifySource[];
  evidence: VerifyEvidence;
  caveats: string[];
  processingMs?: number;
}

/** A wallet object. */
export interface Wallet {
  id: string;
  name: string;
  balance: number;
  currency: string;
  frozen: boolean;
  agentId?: string;
  createdAt?: string;
}

/** Options for creating a wallet. */
export interface CreateWalletOptions {
  name: string;
  agentId?: string;
  currency?: string;
}

/** A wallet spending policy. */
export interface WalletPolicy {
  maxPerTransaction?: number | null;
  maxPerHour?: number | null;
  maxPerDay?: number | null;
  allowedRecipients?: string[] | null;
  requiresApprovalAbove?: number | null;
}

/** An escrow object. */
export interface Escrow {
  id: string;
  status: "pending" | "active" | "released" | "refunded" | "disputed";
  amount: number;
  description: string;
  creatorWalletId: string;
  workerWalletId?: string | null;
  deadline?: string | null;
  createdAt?: string;
}

/** Options for creating an escrow. */
export interface CreateEscrowOptions {
  creatorWalletId: string;
  amount: number;
  description: string;
  workerWalletId?: string;
  deadline?: string;
}
