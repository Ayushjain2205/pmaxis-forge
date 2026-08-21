# PMEX Forge — Product Requirements

**Status:** v2 desk  
**Date:** 22 August 2026  
**Product:** PMEX Forge  
**V2 name:** Research desk

Forge is a prediction-markets **research harness**: an agent that can look up live market data, show its work, and sit in a branded desk. It is not a trading bot.

---

## 1. One-sentence pitch

Open a website, scan live Polymarket boards, ask the agent, and inspect the book — grounded in PMAxis, running on DeepSeek Harness, with every tool call visible.

## 2. Why this exists

PMEX already has the pieces around the agent, not the agent itself:

| Product | Job |
|---|---|
| **PMAxis** | Live market data (REST, WebSocket, MCP) |
| **Hunter** | Which wallets are worth watching |
| **Shadow / PMEX** | Copy-trade and bot execution |
| **Forge** | The agent that *reads* (v2 desk) and later *acts* |

Today the PMAxis MCP is useful inside Cursor. Forge is that same data, with a real agent loop (sessions, trajectory, permissions) that a non-IDE user can open in a browser.

## 3. What v2 is

A **DeepSeek Harness profile** named `pmex` that:

1. Serves the **Forge desk** at `http://127.0.0.1:3080` (not DeepSeek’s coding UI).
2. Connects to the existing **PMAxis MCP** so the model can search, inspect, and compare markets.
3. Shows live Top / Breaking / Resolving boards and a market inspector via a host-side PMAxis GET proxy (the browser never sees `PMAXIS_API_KEY`).
4. Behaves as a **research-only** agent: no orders, no paper fills, no live trading keys.
5. Keeps bash / file-edit tools off so this is not a coding agent with a market plugin bolted on.

### What a session feels like

You run `dsh --profile pmex`. A browser opens on the Forge desk. Boards fill without asking the model. You click a row to inspect the book, or you ask:

- “What’s breaking in politics in the last hour?”
- “Compare the two most liquid election markets.”
- “Is this book actually liquid, or is the price thin?”

The model calls PMAxis tools. Those calls are visible in the chat trajectory. If you cannot see the work, the product has failed.

## 4. Goals and non-goals

### Goals (v2)

- Prove that **dsh + PMAxis MCP + our desk** is a useful research loop in a browser.
- Ship from **npm dsh**, not a fork of `deepseek-ai/deepseek-harness`.
- Reuse the MCP we already maintain — do not re-wrap REST for the agent. Boards/inspector may call REST through a local allow-listed proxy.
- Make the agent obviously a **market researcher**, not a generic coding assistant.

### Non-goals (v2)

- Hosting / multi-tenant SaaS / login / billing (`forge.pmex.app` is v4).
- Paper or live trading, CLOB keys, hunter copy-sim.
- A first-party TypeScript PMAxis client used by the model (MCP is the model’s interface).
- Connecting via hosted SSE (`mcp.pmaxis.trade/sse`) — v2 still uses local stdio + `@pmaxis/mcp-server`.
- Wallet clustering, webhook CRUD, or “watch wallet” as encouraged agent behavior.
- Replacing Hunter, Shadow, or the PMEX control plane.
- Keeping DeepSeek’s web chrome.

## 5. Users

| Who | What they do in v2 |
|---|---|
| **You (builder)** | Run the profile locally, research live markets in the Forge desk. |
| **Internal / power user** | Ask live-market questions without opening Cursor. |
| **Customer (later)** | Not yet. They should never install dsh or see `127.0.0.1`. |

v2 is still a **builder’s harness**, not a hosted product.

## 6. How the pieces connect

```text
Browser
  → Forge desk SPA              (ours, served by dsh on :3080)
      → dsh engine              (@deepseek-ai/dsh from npm, pinned)
          → MCP client plugin   (theirs)
              → @pmaxis/mcp-server
                  → api.pmaxis.trade
      → /forge/pmaxis GET proxy (ours, env key)
          → api.pmaxis.trade
```

| Layer | Where it lives | We own it? |
|---|---|---|
| Agent loop, sessions | `npm` package `@deepseek-ai/dsh` | No — pin and upgrade |
| MCP bridge | `@deepseek-ai/dsh-mcp-client` | No |
| Market tools | `@pmaxis/mcp-server` | Yes (existing) |
| Desk UI + host proxy | `apps/desk`, `packages/dsh-forge-web` | Yes |
| Profile, persona, tool policy | `packages/dsh-pmaxis` | Yes |

**This git repo never contains a clone or fork of `deepseek-ai/deepseek-harness`.** Adapter packages may depend on published `@deepseek-ai/*` npm packages.

### Runtime home vs this repo

- **This repo** — profile patches, persona, desk SPA, docs.
- **`~/.dsh` (or `$DSH_HOME`)** — dsh profiles, sessions, credentials. Not committed.
- **Secrets** — `PMAXIS_API_KEY` (env) and the model key (env or desk Keys sheet / `~/.dsh`). Never in git.

## 7. Functional requirements

### F1 — Boot

- A documented command starts profile `pmex` and opens the Forge desk on loopback.
- dsh version is **pinned** (exact preview version, not `latest`).
- Missing `PMAXIS_API_KEY` fails in a way a human can understand.
- Profile stack: `dsh-base` → `dsh-web-app` (host/`/api` only) → `dsh-forge-web` (our dist) → `dsh-pmaxis`. DeepSeek chrome is disabled.

### F2 — PMAxis via MCP

- Profile mounts one `@deepseek-ai/dsh-mcp-client` row:
  - `serverName: pmaxis`
  - `transport: stdio`
  - `command: npx`, `args: ['-y', '@pmaxis/mcp-server']`
  - env: `PMAXIS_API_KEY`, `PMAXIS_API_URL=https://api.pmaxis.trade`
- Tools appear to the model as `mcp__pmaxis__<tool>`.

### F3 — Research persona

- You are a prediction-markets research assistant.
- You must ground claims in tool results (prices, books, titles).
- You do not place trades, give sizing advice as if capital were live, or claim to execute.
- Prefer discovery + detail tools (search, top, trending, breaking, resolving, market, price, orderbook, summary, signals, compare, related). Avoid webhook, watch, and clustering tools unless the user explicitly asks.

### F4 — Not a coding agent

- Bash / file-edit / workspace tools are disabled in this profile.
- The agent should not write scripts to “trade later” or shell out to curl PMAxis.

### F5 — Visible work

- Tool calls and results remain inspectable in the desk trajectory.

### F6 — Desk surfaces

- Sessions: collapsible rail from `session.list`; click a row to hydrate `session.history`.
- Chat: primary stage — `session.create` / `session.prompt` / mux WebSocket against the same dsh engine.
- Markets: right-hand catalog — All, Top/Breaking/Resolving/Trending, then live categories from PMAxis. Search in the rail. Click a row to open the book (inspector drills in).
- Inspector: sheet inside the catalog for a pinned market (row click, or pin from a tool result `market_id`).
- Keys dialog: native `<dialog>` for OpenRouter or DeepSeek credential + model picker.

## 8. Experience bar

**Pass:** Sit for 20 minutes: boards fill, inspector matches the proxy, chat shows `mcp__pmaxis__*` cards, no DeepSeek logo, no API key in the network panel.

Suggested eval prompts (chat, live data):

1. Top markets by volume right now.
2. Breaking markets in the last hour — what moved and is the book real?
3. Search a current news topic and compare two related markets.
4. Full profile + orderbook for one market the agent just named.
5. Markets resolving this week with the most activity.

**Fail:** Hallucinated prices, no tool calls, bash/file tools, or DeepSeek chrome.

## 9. Phased roadmap

### V1 — research harness

Profile + MCP + persona + pinned dsh. Official dsh web UI. Done.

### V2 — this PRD (PMEX desk)

Our website (boards, inspector, chat, branding). Same dsh engine, same MCP. Local-only.

### V3 — paper, then live

Paper broker as native dsh tools. Live CLOB behind the same interface, user-controlled wallets, deliberate unlock.

### V4 — hosted product

Users hit `forge.pmex.app`. Auth and ledgers are ours. dsh runs in a per-user worker. Nobody is handed `dsh` or `~/.dsh`.

## 10. Risks

| Risk | Mitigation |
|---|---|
| dsh is developer preview; APIs will break | Pin version; our surface is a profile patch, not a fork |
| 34–53 MCP tools overwhelm the model | Persona first; allow-list only if evals fail |
| SSE vs streamable HTTP mismatch | stdio + npx, not `mcp.pmaxis.trade/sse` |
| Credits: free PMAxis tier is 5k/month | Research prompts; no webhook spam; boards poll ~15s |

## 12. V2 deliverables (this repo)

- This PRD.
- `packages/dsh-pmaxis`: MCP row, research preset.
- `packages/dsh-forge-web`: host surface, static dist, `/forge/pmaxis` proxy.
- `apps/desk`: Vite React desk.
- README: install pinned dsh, set keys, build desk, one command to boot.

No trading package. No vendored harness.

---

*PMEX Forge v2 is successful if we would actually use this desk instead of Polymarket plus Cursor — not if it already looks like the hosted product.*
