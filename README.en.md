# NextCode

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="NextCode" width="128" height="128" />
</div>
<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

NextCode is an AI coding workbench: a desktop app, a browser UI, and a terminal agent. This repository
contains the clients, the backend service, the shared UI, and the Agent CLI plus runtime sources.

## Origin and license

- This repository is a **derivative custom build of the open-source ZCode project**: the upstream baseline
  is commit `872ad96` (version 3.14.0). It modifies the original sources rather than rewriting them.
- Licensed under the **Apache License 2.0**, the same license as the original project: this repository
  **continues the original license** and neither replaces nor overrides it. The original copyright notices
  and third-party attributions are kept intact in [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- This is an internal custom build. It **is not the upstream project** and does not use the upstream
  community or support channels. The two upstream commits were removed from the local Git history; see
  [BUILD.md](BUILD.md) for the location and usage of the history backup bundle.
- See [BUILD.md](BUILD.md) for the customization log and the packaging manual, [specs/](specs/) for the
  rules and acceptance criteria of each behavior change, and [AGENTS.md](AGENTS.md) for contributor rules.

### Product identity and internal identifiers

| Item                     | Value                                         |
| ------------------------ | --------------------------------------------- |
| Product name / installer | `NextCode` / `NextCode-{version}-win-x64.exe` |
| appId / Windows AUMID    | `dev.nextcode.app`                            |
| Data directory           | still `~/.zcode` (override with `ZCODE_HOME`) |
| CLI command              | still `zcode`                                 |

Internal identifiers are intentionally unchanged: `@zcode/*` package names, `ZCODE_*` environment
variables, the `zcode` command, the `zcode-protocol` identifier, the `~/.zcode` data directory and
storage keys. This keeps compatibility with upstream code, persisted data, and existing users. See the
product-identity section of BUILD.md for scope and rationale.

## Differences from upstream (summary)

| Area               | This build                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Branding           | Product name, icons, installer and UI copy are NextCode (CLI command unchanged)                                          |
| Official channels  | Docs/community/issue-report/feature-request and "check for updates" entries removed; no requests to the official backend |
| Telemetry          | Disabled at compile time; the telemetry SDK dependency was removed                                                       |
| Updates            | Official auto-update and forced upgrade are disabled                                                                     |
| Remote workspaces  | Runtime assets ship with the installer and resolve locally first, not from the official CDN                              |
| Themes             | Added a "hacker" theme; theme options have a single source shared by settings and the sidebar menu                       |
| Web remote control | Built-in panel (QR pairing) plus response security headers (CSP) and mobile layout support                               |
| Copy               | i18n dead-key tooling keeps the two locale tables in sync                                                                |

## Customization details and capability improvements

> Timeline: 3.14.0 → 3.18.0, starting 2026-09-21. Per-item details, verification notes and lessons are in
> the customization log of [BUILD.md](BUILD.md); rules and acceptance criteria per change are in
> [specs/](specs/).

### 1. Brand and identity

- Product name, installer name, appId/AUMID and the Windows/Linux executable names are **NextCode**; UI
  copy, page titles, the About window, tray tooltip and share pages follow (113 entries per locale).
  **Improvement:** the installed app and the running process have their own identity instead of looking
  like an upstream build.
- Logo and every image switched to the same-style "N" mark (reusing the original Z's stroke weights,
  slant and rounded junctions): 9 app icon sizes + a 7-size ICO, the installer's 3D box icon, the startup
  badge, the draft watermark and the README icon.
  **Improvement:** consistent branding, plus a reproducible generator with a "no leftover glyph" check so
  a stale Z cannot survive in one corner again.
- Internal identifiers (`@zcode/*`, `ZCODE_*`, the `zcode` command, `zcode-protocol`, `~/.zcode`) are
  intentionally unchanged.
  **Improvement:** compatibility with upstream code and existing user data.

### 2. Removing official channels and external dependencies

- Official auto-update and forced upgrade are disabled (the first custom build was force-upgraded by the
  official backend; fixed).
  **Improvement:** the installed custom build cannot be replaced remotely.
- Telemetry is disabled at compile time; the SDK dependency and 11 related modules were deleted.
  **Improvement:** no telemetry reporting; main/preload no longer reference the SDK.
- Remote workspace runtime assets ship inside the installer and resolve locally first.
  **Improvement:** connecting to remote workspaces works offline / without the official CDN, and the
  `manifest not found` failure mode is gone.
- Official channel entries removed: product docs, community, issue report, feature request and check for
  updates (help menu, command palette, tray menu and the macOS native menu together).
  **Improvement:** no entry point that would talk to the official backend remains, and the dead code and
  i18n keys went with them.

### 3. Security and hygiene

- Response security headers for the web service: `nosniff`, `no-referrer` (the QR URL carries a token),
  `X-Frame-Options: DENY`, a tightened `Permissions-Policy`, and a CSP for HTML (scripts limited to this
  service plus sha256-hashed inline scripts, WebAssembly compilation allowed, `object-src 'none'`,
  `frame-ancestors 'none'`).
  **Improvement:** pages cannot load remote scripts, cannot be framed, and the token cannot leak through
  Referer — while diff highlighting and Office previews keep working.
- Dead code and dependency cleanup (9 unreferenced modules plus the ARMS SDK), and a fix for stale
  `node_modules` leftovers being packed into the installer.
  **Improvement:** smaller installer (191.3 → 190.1 MiB) without the telemetry SDK.
- i18n dead-key tooling (`pnpm i18n:dead-keys` / `i18n:prune-dead-keys`).
  **Improvement:** the copy tables can be verified and pruned (410 keys per locale in the first pass), so
  new languages do not translate dead strings.

### 4. New and improved capabilities

| Capability               | What it does / what improved                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt enhancement       | A button next to send polishes the current draft with the selected model and replaces it, with cancel and failure states                                         |
| Sidebar promote & reveal | Activating a project moves it to the top of the list and scrolls it into view, so long project lists no longer require searching                                 |
| Desktop web remote panel | A phone icon next to the username opens a panel: start/stop the service, choose the LAN IP, show a QR code for phone access; the icon turns green while running  |
| Mobile / narrow viewport | Sidebar becomes an overlay drawer and starts collapsed, task list uses an opaque background, web entry points adapt; phones no longer get a desktop layout       |
| Theme system             | New "hacker" theme (black/green with distinguishable semantic hues); theme options come from a single source shared by the settings page and the sidebar menu    |
| Remote workspaces        | Assets ship with the installer (see above): from "download from the official CDN" to "local first, works offline"                                                |
| Brand asset generator    | `scripts/generate-brand-assets.mjs` derives every vector and bitmap from parameterized glyph geometry, with size specs and leftover-glyph verification           |
| Documentation            | README (zh/en) covering origin, license, layout and verification; BUILD.md for the change log and packaging manual; `specs/` for per-change rules and acceptance |

### 5. Fixes

- Sidebar project reveal did nothing (Windows backslashes in `data-testid` were parsed as CSS escapes).
- Prompt enhancement failed immediately (an in-process `AbortSignal` cannot cross the renderer boundary).
- Mobile: the phone icon did not reflect service state, and the task-list drawer had a transparent
  background.
- SSH remote connect failed with `manifest not found for linux-x64` (packaged builds did not pass the
  bundled asset directory to remote deployment).
- The settings theme dropdown did not show the Zai/hacker themes (two hard-coded theme lists, with
  indistinguishable labels).
- A missing `'wasm-unsafe-eval'` blocked WebAssembly compilation for diff highlighting and Office previews.
- The renderer startup badge and About window still showed the old glyph (five inline glyph copies now
  guarded by a verification step).

## Entry points

| Entry     | Purpose                                                            | Dev command                    |
| --------- | ------------------------------------------------------------------ | ------------------------------ |
| Desktop   | Electron desktop app                                               | `pnpm dev:desktop`             |
| Web       | Browser workbench (backend + web client)                           | `pnpm dev:web`                 |
| Agent CLI | `zcode` in the terminal, and the agent runtime for Desktop and Web | `pnpm --filter @zcode/cli dev` |

## Setup

Prepare Git, Node.js **24.14.0** and pnpm **10.33.2** (see [mise.toml](mise.toml)). All commands below run
from the repository root.

```bash
pnpm bootstrap
```

`pnpm bootstrap` installs workspace dependencies, prepares desktop local runtime assets, then runs
`build:bootstrap`.

The Agent CLI and runtime live in [apps/zcode-cli/](apps/zcode-cli/) as a plain directory in this
repository — no separate checkout or Git submodule needed.

| Command                        | Purpose                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm install`                 | Install dependencies                                                                |
| `pnpm prepare:desktop-runtime` | Prepare desktop runtime assets (includes remote assets by default)                  |
| `pnpm prepare:remote-assets`   | Prepare remote runtime assets only                                                  |
| `pnpm bootstrap:with-remote`   | Dependencies, local and remote assets, then serial builds; skips the desktop bundle |
| `pnpm build`                   | Run each workspace package's build script, including asset preparation              |

By default `bootstrap` skips remote asset preparation, which is what local desktop development needs.
Run the corresponding prepare command when using remote workspaces or verifying remote release assets.

## Development

### Desktop

```bash
pnpm dev:desktop

# test environment
pnpm dev:desktop:test
```

`pnpm dev:desktop` equals `pnpm dev:desktop:prod` and uses production service configuration. The script
prepares local runtime assets, builds the desktop agent, then starts Electron with source watching.

For a separate development data directory, set `ZCODE_DATA_BASE_DIR`:

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### Remote features (SSH/WSL)

Run `pnpm bootstrap:with-remote` first, then `pnpm dev:desktop`, and choose "download locally then upload"
when connecting to a remote project. In development, assets come from the local
`packages/desktop/mock-cdn` and local build output, are uploaded over SFTP, and never touch the CDN.
Release installers ship runtime assets inside the package (see
[specs/bundled-remote-runtime-assets.md](specs/bundled-remote-runtime-assets.md)).

### Web development

```bash
pnpm dev:web

# specify the backend workspace (macOS / Linux)
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

This starts the web dev server (`http://localhost:5173`) and the backend (`http://localhost:3030`);
open the former. `/ws` and general `/api` requests are proxied to the local backend.

After changing agent sources, run `pnpm --filter @zcode/cli... build` and restart the service.

### CLI distribution (TUI + Web)

The CLI distribution bundles the TUI, Web and Agent under a single `zcode` command: no arguments starts
the TUI, `--web` starts the web UI, and any other arguments go to the Agent CLI.

```bash
zcode
zcode --web
zcode --web --workspace /path/to/project --port 3030 --no-open
zcode --help
```

Web mode uses the current directory, listens on `127.0.0.1`, picks a free port and opens the browser.
For LAN access use `--host 0.0.0.0`; listening on a non-local address generates an access token by
default, and the printed URL includes it. Use `--token` to set a token or `--no-token` to disable
authentication. When starting the generic web service HTTP entry directly, configure API/WebSocket auth
with `ZCODE_SERVER_AUTH_TOKEN`; when creating the service programmatically, pass `authToken`.

`pnpm build:zcode` only produces the distribution and does not replace an existing `zcode` on `PATH`.
Check with `command -v zcode` (macOS / Linux) or `where.exe zcode` (Windows).

### CLI source development

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

## Configuration

[.env.example](.env.example) documents service addresses and build settings; copy it to `.env`, and put
local overrides in `.env.local`. Pick the desktop environment with `dev:desktop:test` / `dev:desktop:prod`.

| Setting                              | Purpose                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `ZCODE_DATA_BASE_DIR`                | Application data base directory; data goes into `.zcode/` under it |
| `ZCODE_SERVER_WORKSPACE`             | Workspace path for the web backend                                 |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Local provider config file path; built-in config is used otherwise |
| `ZCODE_DIST_BASE_URL`                | Download root used by the CLI install script                       |

Bundled default configuration: [config/README.md](config/README.md).

## Packaging

### Desktop (Windows x64 — the main path for this custom build)

The full manual (version management, winCodeSign workaround, artifact verification) is in
[BUILD.md](BUILD.md):

```bash
pnpm --filter @zcode/desktop run bundle -- --os win --arch x64
```

Three stages: prepare runtime assets (bundled remote assets and the web-remote build) → production build →
electron-builder. Artifacts land in `packages/desktop/dist/`: `NextCode-{version}-win-x64.exe`,
`latest.yml`, `win-unpacked/`.

The upstream cross-platform entry remains available (`pnpm bundle:desktop`, default macOS arm64,
`--os mac|win|linux`).

### CLI distribution

`pnpm build:zcode` builds the CLI/TUI, backend and Web, collects TUI native libraries, workers and
runtime dependencies, then assembles the distribution (running it still requires Node.js, see
[mise.toml](mise.toml)).

Set the download root `ZCODE_DIST_BASE_URL` (in `.env`, `.env.local` or the environment), or pass
`--base-url`:

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/
pnpm build:zcode                 # with ZCODE_DIST_BASE_URL configured
pnpm build:zcode --skip-build    # reuse existing build output, only re-assemble
pnpm build:zcode --help
```

The version comes from the root `package.json` and output goes to `dist/zcode/`:
`releases/<version>/zcode-<version>.tar.gz`, `releases/<version>/sha256.txt`, `latest.json`, `install.sh`.
The install script installs to `~/.zcode/runtime` by default (override with `ZCODE_DIST_HOME`) and creates
a `zcode` command in `~/.local/bin` (override with `ZCODE_DIST_BIN_DIR`).

Third-party notices are generated by [scripts/third-party-notices.mjs](scripts/third-party-notices.mjs)
from the material in [third-party/](third-party/); see that script and the desktop build config for where
the notices are placed in each distribution.

## Repository layout

| Path                                               | Responsibility                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/desktop`                                 | Electron main, host, renderer, built-in web remote control, desktop packaging        |
| `packages/web`                                     | Web client (mobile layout, first-paint theme)                                        |
| `packages/server`                                  | HTTP / WebSocket service, security headers, remote connections                       |
| `packages/zcode-server-cli`                        | Standalone server bootstrap and process management                                   |
| `packages/ui`                                      | Shared React components, hooks, Zustand stores, i18n tables, theme tokens            |
| `packages/services`                                | Business services and persistence (sessions, tasks, settings, feedback)              |
| `packages/shared`                                  | Shared protocol and types, platform interfaces, desktop menu and channel definitions |
| `packages/rpc`                                     | RPC framework and IPC transport                                                      |
| `packages/client`                                  | Agent client SDK                                                                     |
| `packages/provider`, `packages/provider-node`      | Model/account provider configuration and selection, plus the Node implementation     |
| `packages/model-option-map`                        | Model option map resolution/evaluation (own typecheck script)                        |
| `packages/zcode-cua`, `packages/formal-proof`      | Computer Use placeholder (runtime fails closed); standalone Vite visualization page  |
| `apps/zcode-cli`                                   | Agent CLI, TUI, core runtime and tools (a nested workspace)                          |
| `scripts/`                                         | Build/maintenance scripts, architecture check, i18n and brand asset generators       |
| `config/`                                          | Built-in configuration shipped with the client                                       |
| `harness/remote/`                                  | Manual verification environment for remote features (Docker)                         |
| `patches/`                                         | Dependency patches                                                                   |
| `public/`                                          | Documentation assets such as the README icon                                         |
| `specs/`                                           | Rules and acceptance criteria for each customization                                 |
| `third-party/`                                     | Third-party inventory and notice generation material                                 |
| `BUILD.md`, `AGENTS.md`, `DESIGN.md`, `CONTEXT.md` | Build/customization log, contributor rules, UI design spec, plugin-store vocabulary  |

## Development and verification commands

| Purpose                 | Command                                            |
| ----------------------- | -------------------------------------------------- |
| Type check              | `pnpm typecheck`                                   |
| Lint / format           | `pnpm lint` / `pnpm lint:fix` / `pnpm fmt:check`   |
| Architecture check      | `pnpm architecture:check --changed`                |
| Module context package  | `pnpm architecture:context <module-id>`            |
| Unused deps and exports | `pnpm knip`                                        |
| i18n dead keys (report) | `pnpm i18n:dead-keys`                              |
| i18n dead keys (prune)  | `pnpm i18n:prune-dead-keys -- --write`             |
| Unit tests              | `node_modules/.bin/tsx --test <path/to/*.test.ts>` |
| Regenerate brand assets | `node scripts/generate-brand-assets.mjs`           |

Test entry points follow each package's `package.json` and the actual test files; the repository does not
provide a single unit/E2E command.

## Project notices

See [NOTICE.md](NOTICE.md) for feature and risk notices, maintenance rules, execution and data risks, and
license/third-party attribution — including this repository's status as a derivative custom build.
