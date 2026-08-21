# PMEX Forge — Product Requirements

**Status:** Draft for v1  
**Date:** 22 August 2026  
**Product:** PMEX Forge  
**V1 name:** Research harness

Forge is a prediction-markets **research harness**: an agent that can look up live market data, show its work, and sit in a browser. It is not a trading bot in v1.

---

## 1. One-sentence pitch

Open a website, ask about live Polymarket markets, and get answers grounded in PMAxis — with every tool call visible — running on DeepSeek Harness from day one.

## 2. Why this exists

PMEX already has the pieces around the agent, not the agent itself:

| Product | Job |
|---|---|
| **PMAxis** | Live market data (REST, WebSocket, MCP) |
| **Hunter** | Which wallets are worth watching |
| **Shadow / PMEX** | Copy-trade and bot execution |
| **Forge** | The agent that *reads* (v1) and later *acts* |

Today the PMAxis MCP is useful inside Cursor. Forge is that same data, with a real agent loop (sessions, trajectory, permissions) that a non-IDE user can open in a browser.

Prediction markets are a good fit for an LLM agent: the edge is reading questions, books, related markets, and flow — not winning a latency race.

## 3. What v1 is

A **DeepSeek Harness profile** named `pmex` that:

1. Boots the official dsh web UI at `http://127.0.0.1:3080`.
2. Connects to the existing **PMAxis MCP** so the model can search, inspect, and compare markets.
3. Behaves as a **research-only** agent: no orders, no paper fills, no live keys.
4. Keeps bash / file-edit tools off so this is not a coding agent with a market plugin bolted on.

**The website we serve in v1 is DeepSeek’s web UI.** Chat, sessions, settings, and trajectory are theirs. Market intelligence is ours, via MCP. A PMEX-branded desk is explicitly v2, not a day-one deliverable.

### What a session feels like

You run `dsh --profile pmex`. A browser opens. You ask:

- “What’s breaking in politics in the last hour?”
- “Compare the two most liquid election markets.”
- “Is this book actually liquid, or is the price thin?”
- “Summarize this wallet’s open positions.” (if you paste an `0x` address)

The model calls PMAxis tools. You can see those calls in the trajectory. If you cannot see the work, the product has failed.

## 4. Goals and non-goals

### Goals (v1)

- Prove that **dsh + PMAxis MCP** is a useful research loop in a browser.
- Ship from **npm dsh**, not a fork of `deepseek-ai/deepseek-harness`.
- Reuse the MCP we already maintain — do not re-wrap REST for the agent.
- Make the agent obviously a **market researcher**, not a generic coding assistant.
- Leave a clean seam for a custom UI and for trading later.

### Non-goals (v1)

- Custom PMEX branding, boards, or inspector UI.
- Hosting / multi-tenant SaaS / login / billing.
- Paper or live trading, CLOB keys, hunter copy-sim.
- A first-party TypeScript PMAxis client used by the model (MCP is the model’s interface).
- Connecting via hosted SSE (`mcp.pmaxis.trade/sse`) — dsh’s client is stdio or streamable HTTP; v1 uses local stdio + `@pmaxis/mcp-server`.
- Wallet clustering, webhook CRUD, or “watch wallet” as encouraged agent behavior.
- Replacing Hunter, Shadow, or the PMEX control plane.

## 5. Users

| Who | What they do in v1 |
|---|---|
| **You (builder)** | Run the profile locally, judge whether the loop is worth a custom UI. |
| **Internal / power user** | Ask live-market questions without opening Cursor. |
| **Customer (later)** | Not in v1. They should never install dsh or see `127.0.0.1`. |

v1 is a **builder’s harness**, not a hosted product. The hosted shape (your website in front, dsh as a worker) is documented so we do not paint ourselves into a laptop-only corner — we do not build it yet.

## 6. How the pieces connect

```text
Browser
  → DeepSeek Harness web UI     (theirs, served by dsh)
      → dsh engine              (@deepseek-ai/dsh from npm, pinned)
          → MCP client plugin   (theirs)
              → @pmaxis/mcp-server  (ours, already shipped)
                  → api.pmaxis.trade
```

| Layer | Where it lives | We own it? |
|---|---|---|
| Agent loop, sessions, trajectory, UI | `npm` package `@deepseek-ai/dsh` | No — pin and upgrade |
| MCP bridge | `@deepseek-ai/dsh-mcp-client` | No |
| Market tools | `@pmaxis/mcp-server` | Yes (existing) |
| Profile, persona, tool policy | this repo | Yes |
| Custom desk UI | later, this repo | Yes, not v1 |

**This git repo never contains a clone or fork of `deepseek-ai/deepseek-harness`.** Adapter packages may depend on published `@deepseek-ai/*` npm packages. Domain logic (when we add it) must not import dsh.

### Runtime home vs this repo

- **This repo** — profile patch, persona, docs, later UI.
- **`~/.dsh` (or `$DSH_HOME`)** — dsh profiles, sessions, credentials. Not committed.
- **Secrets** — `PMAXIS_API_KEY` and the DeepSeek API key live in env / dsh credentials, never in git.

## 7. Functional requirements

### F1 — Boot

- A documented command starts profile `pmex` and opens the dsh web UI on loopback.
- dsh version is **pinned** (exact preview version, not `latest`).
- Missing `PMAXIS_API_KEY` fails in a way a human can understand.

### F2 — PMAxis via MCP

- Profile mounts one `@deepseek-ai/dsh-mcp-client` row:
  - `serverName: pmaxis`
  - `transport: stdio`
  - `command: npx`, `args: ['-y', '@pmaxis/mcp-server']`
  - env: `PMAXIS_API_KEY`, `PMAXIS_API_URL=https://api.pmaxis.trade`
- Tools appear to the model as `mcp__pmaxis__<tool>`.
- Prefer the npx server (today ~34 tools) over hosted SSE for attach reliability.

### F3 — Research persona

A system / agent prompt that states:

- You are a prediction-markets research assistant.
- You must ground claims in tool results (prices, books, titles).
- You must call `get_current_time` before reasoning about “now”, windows, or resolution.
- You do not place trades, give sizing advice as if capital were live, or claim to execute.
- Prefer discovery + detail tools (search, top, trending, breaking, resolving, market, price, orderbook, summary, signals, compare, related). Avoid webhook, watch, and clustering tools unless the user explicitly asks.

### F4 — Not a coding agent

- Bash / file-edit / workspace tools are disabled or restricted in this profile.
- The agent should not write scripts to “trade later” or shell out to curl PMAxis.

### F5 — Visible work

- Tool calls and results remain inspectable in dsh’s trajectory / tool cards.
- We do not hide MCP results behind a summary-only UI in v1 (we do not control that UI yet).

### F6 — Out of scope but not blocked

The following must remain *possible* without a rewrite:

- Swap the dsh web UI for a PMEX desk that talks to the same profile.
- Add native tools (paper broker, hunter) beside MCP.
- Run dsh as a worker behind a hosted PMEX site.

## 8. Experience bar (v1)

**Pass:** Sit for 20 minutes, ask five real questions, and prefer this over opening Polymarket or Cursor for those questions.

Suggested eval prompts (must work against live data):

1. Top markets by volume right now.  
2. Breaking markets in the last hour — what moved and is the book real?  
3. Search a current news topic and compare two related markets.  
4. Full profile + orderbook for one market the agent just named.  
5. Markets resolving this week with the most activity.

**Fail:** Hallucinated prices, no tool calls, or the model using bash to scrape the web instead of MCP.

## 9. Phased roadmap

### V1 — this PRD (research harness)

Profile + MCP + persona + pinned dsh. Official dsh web UI.

### V1.1 — tighten the tool surface

If 34 tools cause wandering: allow-list the research set, or a thin native plugin that calls the same MCP subset. Only if eval prompts show confusion or wasted credits.

### V2 — PMEX desk UI

Our website (boards, inspector, chat, branding). Same dsh engine, same MCP. Customers still might be local-only.

### V3 — paper, then live

Paper broker as native dsh tools. Live CLOB behind the same interface, user-controlled wallets, deliberate unlock. Hunter as a signal feed, not a rewrite of hunter.

### V4 — hosted product

Users hit `forge.pmex.app`. Auth and ledgers are ours. dsh runs in a per-user worker. Nobody is handed `dsh` or `~/.dsh`.

## 10. Risks

| Risk | Mitigation |
|---|---|
| dsh is developer preview; APIs will break | Pin version; our surface is a profile patch, not a fork |
| 34–53 MCP tools overwhelm the model | Persona first; allow-list only if evals fail |
| npm MCP server lags hosted (34 vs 53 tools) | Accept for v1; 34 covers research |
| SSE vs streamable HTTP mismatch | stdio + npx, not `mcp.pmaxis.trade/sse` |
| Looks like “DeepSeek with a plugin” | Accepted for v1; v2 is the brand |
| Credits: free PMAxis tier is 5k/month | Research prompts; no webhook spam; watch `X-Credits-*` |

## 11. Open questions

1. Exact `@deepseek-ai/dsh` version to pin when we start (latest rc at build time).  
2. How completely can this profile disable shell/fs without fighting `dsh-base`? (Resolve in the first boot, document the patch.)  
3. Do we want Standard mode (full dsh toolset then strip) or a custom preset from the start? Default: **custom profile on top of `dsh-base` + web**, strip coding tools.  
4. DeepSeek model: Flash vs Pro for this research loop — pick after the first eval set, not before.

## 12. V1 deliverables (this repo)

When v1 is “done,” the repo contains:

- This PRD (living doc).  
- A `pmex` profile definition: MCP row, persona, coding-tool restrictions.  
- README: install pinned dsh, set keys, one command to boot.  
- A short eval script or checklist for the five prompts above.

No custom frontend. No trading package. No vendored harness.

---

*PMEX Forge v1 is successful if dsh-from-day-one plus the MCP we already have is a loop we would actually use — not if it already looks like the hosted product.*
