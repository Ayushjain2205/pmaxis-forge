# PMEX Forge

Prediction-markets research desk. **v2** runs on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `0.1.1-rc.2` and [PMAxis](https://www.pmaxis.trade/llms.txt). No trading.

Product spec: [docs/PRD.md](docs/PRD.md).

## What you get

`dsh --profile pmex` opens the **Forge desk** at `http://127.0.0.1:3080` — not DeepSeek’s coding UI.

- **Boards** — live Top / Breaking / Resolving lists (PMAxis REST via a host proxy).
- **Chat** — the `pmex` research agent; `mcp__pmaxis__*` tool calls stay visible.
- **Inspector** — book and stats for a pinned market (click a row, or pin from a tool result).

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/) on `PATH` (`dsh plugin` forwards to it)
- `@deepseek-ai/dsh@0.1.1-rc.2` (do not use `@latest`)

```bash
npm install -g @deepseek-ai/dsh@0.1.1-rc.2
dsh --version   # 0.1.1-rc.2
```

## Keys

Two keys, two jobs. Neither belongs in git.

1. **OpenRouter** (the model) — paste on the desk **keys** sheet, or export `OPENROUTER_API_KEY` (env wins). Default model is `deepseek/deepseek-v4-flash` via OpenRouter. Official DeepSeek still works if you fill that field instead.
2. **PMAxis** (market data) — export before boot:

```bash
export PMAXIS_API_KEY=pmx_live_...
export PMAXIS_API_URL=https://api.pmaxis.trade   # optional, this is the default
```

See `.env.example`. The profile fails to start if PMAxis MCP cannot connect (`failOnStartupError`). The desk never sees this key; boards call `/forge/pmaxis/*` on the host.

## Install bundles into profile `pmex`

From this repo (pnpm 9 treats the profile as a workspace root, so pass `-w`):

```bash
pnpm install
pnpm --filter desk build
dsh plugin --profile pmex add -w @deepseek-ai/dsh-web-app@0.1.1-rc.2
dsh plugin --profile pmex add -w ./packages/dsh-forge-web
dsh plugin --profile pmex add -w ./packages/dsh-pmaxis
```

Profile bundles must be `dsh-base` → `@deepseek-ai/dsh-web-app` → `dsh-forge-web` → `dsh-pmaxis`. `dsh-web-app` stays installed for the host/`/api` packages; **Forge replaces its UI** (you should not see DeepSeek chrome).

Re-run the `add` commands after pulling bundle changes. Rebuild the desk (`pnpm --filter desk build`) whenever you change `apps/desk`.

## Boot

```bash
export PMAXIS_API_KEY=pmx_live_...
dsh --profile pmex
```

Browser: `http://127.0.0.1:3080`. Confirm the page says **forge**, not DeepSeek Harness.

Dev (Vite on `:5173`, proxies `/api` and `/forge` to `:3080`):

```bash
dsh --profile pmex --no-open
pnpm --filter desk dev
```

## Eval prompts (live data)

Pass = boards fill without the agent, inspector matches the proxy, and a chat turn shows `mcp__pmaxis__*` with numbers that match the tool result. Fail = no tools, hallucinated prices, bash/file tools, or DeepSeek chrome.

1. Top markets by volume right now.
2. Breaking markets in the last hour — what moved, and is the book real?
3. Search a current news topic and compare two related markets.
4. Full profile + orderbook for one market the agent just named.
5. Markets resolving this week with the most activity.

## Layout

```text
apps/desk/               Vite React desk (builds into dsh-forge-web/dist)
packages/dsh-forge-web/  host surface: static dist + /forge/pmaxis proxy
packages/dsh-pmaxis/     MCP row + copies the pmex preset
docs/PRD.md              product spec
```

`~/.dsh/profiles/pmex` is created by `dsh` on your machine. Do not commit it.
