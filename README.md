# @agenttool/sdk · TypeScript

> Persistent memory, reasoning traces, fact verification, tool access, and agent-to-agent payments — one API key.

[![npm](https://img.shields.io/npm/v/@agenttool/sdk)](https://www.npmjs.com/package/@agenttool/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![API Status](https://img.shields.io/badge/API-live-brightgreen)](https://api.agenttool.dev/health)

```bash
npm install @agenttool/sdk
# or
bun add @agenttool/sdk
```

## What is this?

AgentTool gives AI agents the infrastructure they need to operate reliably:

| Service | What it does |
|---------|-------------|
| **agent-memory** | Persistent semantic memory — store facts, retrieve by similarity |
| **agent-tools** | Web search, page scraping, sandboxed code execution |
| **agent-verify** | Fact-check claims with AI-powered evidence gathering |
| **agent-economy** | Wallets, spending policies, escrow, agent-to-agent payments |
| **agent-trace** | Reasoning provenance — log and search decision traces |

All five services, one API key, one SDK.

## Quick start (60 seconds)

**1. Get your API key** — create a free project at [app.agenttool.dev](https://app.agenttool.dev)

**2. Set your key:**
```bash
export AT_API_KEY=at_your_key_here
```

**3. Store and retrieve a memory:**
```typescript
import { AgentTool } from "@agenttool/sdk";

const at = new AgentTool(); // reads AT_API_KEY from env

// Store a memory
const memory = await at.memory.store({
  content: "The user prefers dark mode and concise responses",
  agentId: "my-assistant",
  tags: ["preference", "ui"],
});

// Retrieve it later (semantic search)
const results = await at.memory.search({
  query: "what does the user prefer?",
  limit: 5,
});

for (const r of results) {
  console.log(`${r.score.toFixed(2)}  ${r.content}`);
}
```

## Usage

### Memory

```typescript
const at = new AgentTool({ apiKey: "at_..." }); // or use AT_API_KEY env var

// Store
const mem = await at.memory.store({ content: "User is in London, timezone Europe/London" });

// Semantic search
const results = await at.memory.search({ query: "where is the user?", limit: 5 });

// Retrieve by ID
const mem = await at.memory.get("mem_abc123");

// Usage stats
const stats = await at.memory.usage();
console.log(stats.memoriesStored, stats.searchesPerformed);
```

### Tools

```typescript
// Web search
const results = await at.tools.search("latest papers on RAG", { numResults: 5 });
for (const r of results) console.log(r.title, r.url);

// Scrape a page
const page = await at.tools.scrape("https://example.com");
console.log(page.content);      // page text/HTML
console.log(page.statusCode);

// Execute code (sandboxed — Python, JavaScript, Bash)
const result = await at.tools.execute("print(42)", { language: "python" });
console.log(result.output);     // stdout
console.log(result.error);      // stderr
console.log(result.exitCode);   // 0 = success
```

### Verify

```typescript
// Fact-check a claim with AI-powered evidence gathering
const result = await at.verify.check("The Eiffel Tower is 330 metres tall.");
console.log(result.verdict);      // "verified" | "false" | "disputed" | "unverifiable"
console.log(result.confidence);   // 0.0 – 1.0
console.log(result.caveats);      // string[] of nuances

// With domain hint for better evidence
const r = await at.verify.check("Bitcoin was created in 2009.", {
  domain: "finance",             // "finance" | "science" | "medical" | "legal" | "general"
  context: "On the whitepaper publication date",
});
```

### Economy (wallets & escrows)

```typescript
// Create a wallet
const wallet = await at.economy.createWallet({ name: "agent-wallet", agentId: "agent-42" });

// Fund it
await at.economy.fundWallet(wallet.id, { amount: 500, description: "Weekly budget" });

// Spend credits
await at.economy.spend(wallet.id, {
  amount: 10,
  counterparty: "wal_target_id",
  description: "Payment for research task",
});

// Set a spending policy
await at.economy.setPolicy(wallet.id, {
  maxPerTransaction: 50,
  maxPerHour: 200,
  maxPerDay: 1000,
});

// Escrow: lock credits until work is done
const escrow = await at.economy.createEscrow({
  creatorWalletId: wallet.id,
  amount: 100,
  description: "Summarise 50 research papers",
  deadline: "2026-03-14T12:00:00Z",
});
// Worker accepts:
await at.economy.acceptEscrow(escrow.id, "wal_worker");
// Release on completion:
await at.economy.releaseEscrow(escrow.id);
```

### Traces (reasoning provenance)

```typescript
// Store a reasoning trace
const trace = await at.traces.store({
  step: "web_search",
  input: { query: "climate change solutions" },
  output: { results: ["..."] },
});

// Semantic search across traces
const results = await at.traces.search({
  query: "decisions about climate data",
  limit: 5,
});

// Get a chain of reasoning steps
const chain = await at.traces.chain("parent_trace_id");

// Delete
await at.traces.delete(trace.id);
```

## Integration example — LangChain / Vercel AI SDK

```typescript
import { AgentTool } from "@agenttool/sdk";
import { tool } from "ai";
import { z } from "zod";

const at = new AgentTool();

const tools = {
  remember: tool({
    description: "Store a memory for later retrieval",
    parameters: z.object({ content: z.string() }),
    execute: async ({ content }) => {
      const mem = await at.memory.store({ content, agentId: "my-agent" });
      return `Stored memory ${mem.id}`;
    },
  }),
  recall: tool({
    description: "Search past memories by semantic similarity",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      const results = await at.memory.search({ query, limit: 3 });
      return results.map((r) => r.content).join("\n");
    },
  }),
  factCheck: tool({
    description: "Verify whether a factual claim is true",
    parameters: z.object({ claim: z.string() }),
    execute: async ({ claim }) => {
      const result = await at.verify.check(claim);
      return `${result.verdict} (${(result.confidence * 100).toFixed(0)}% confidence)`;
    },
  }),
};
```

## Free tier

| Resource | Free | Seed ($29/mo) | Grow ($99/mo) |
|----------|------|----------------|----------------|
| Memory ops/day | 100 | 10,000 | 100,000 |
| Tool calls/day | 10 | 500 | 5,000 |
| Verifications/day | 5 | 100 | 1,000 |
| Traces/day | 100 | 10,000 | 100,000 |

[Upgrade at app.agenttool.dev/billing](https://app.agenttool.dev/billing)

## Configuration

```typescript
import { AgentTool } from "@agenttool/sdk";

const at = new AgentTool({
  apiKey: "at_...",           // default: AT_API_KEY env var
  baseUrl: "https://api.agenttool.dev",  // default
  timeout: 30_000,            // ms
});
```

## Links

- 🏠 [agenttool.dev](https://agenttool.dev)
- 📖 [docs.agenttool.dev](https://docs.agenttool.dev)
- 🎛️ [app.agenttool.dev](https://app.agenttool.dev) — dashboard + API key
- 📦 [npm](https://www.npmjs.com/package/@agenttool/sdk)
- 🐍 [Python SDK](https://github.com/mynameisyou-cmyk/agenttool-sdk-py)

## License

MIT
