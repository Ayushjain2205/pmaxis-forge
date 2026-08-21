# PMEX Forge

Prediction-markets research harness. **v1** runs on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `0.1.1-rc.2` and [PMAxis MCP](https://www.pmaxis.trade/llms.txt). No trading.

Product spec: [docs/PRD.md](docs/PRD.md).

## What you get

`dsh --profile pmex` opens **DeepSeek’s web UI** at `http://127.0.0.1:3080`. The model calls live PMAxis tools (`mcp__pmaxis__*`). Sessions default to the `pmex` preset: research persona, no bash / files / editor.

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

1. **OpenRouter** (the model) — open **Settings → Models**, paste the key on the OpenRouter card, save. Or export `OPENROUTER_API_KEY` (env wins). Default model is `deepseek/deepseek-v4-flash` via OpenRouter; change it in the picker. Official DeepSeek still works if you fill that card instead.
2. **PMAxis** (market data) — export before boot:

```bash
export PMAXIS_API_KEY=pmx_live_...
export PMAXIS_API_URL=https://api.pmaxis.trade   # optional, this is the default
```

See `.env.example`. The profile fails to start if PMAxis MCP cannot connect (`failOnStartupError`).

## Install this bundle into profile `pmex`

From this repo (pnpm 9 treats the profile as a workspace root, so pass `-w`):

```bash
dsh plugin --profile pmex add @deepseek-ai/dsh-web-app@0.1.1-rc.2 -w
dsh plugin --profile pmex add -w ./packages/dsh-pmaxis
```

The first command is only needed on a fresh profile (custom names start as `dsh-base` only). Re-run the second after pulling bundle changes.

## Boot

```bash
dsh --profile pmex
```

Browser: `http://127.0.0.1:3080`. Confirm the session preset is **PMEX research** (`pmex`). New sessions use it by default; a blank session can still be switched to `standard` in the UI — don’t, if you want a research-only agent.

## Eval prompts (live data)

Pass = a `mcp__pmaxis__*` tool call is visible in the trajectory, and numbers match the tool result (not invented). Fail = no tools, hallucinated prices, or bash/file tools.

1. Top markets by volume right now.
2. Breaking markets in the last hour — what moved, and is the book real?
3. Search a current news topic and compare two related markets.
4. Full profile + orderbook for one market the agent just named.
5. Markets resolving this week with the most activity.

## Layout

```text
packages/dsh-pmaxis/     dsh bundle (MCP row + copies the pmex preset)
docs/PRD.md              product spec
```

`~/.dsh/profiles/pmex` is created by `dsh` on your machine. Do not commit it.
