# NimFeed

[![Live on GitHub Pages](https://img.shields.io/badge/Live-GitHub%20Pages-324fff?logo=github)](https://maestroi.github.io/NimFeed/)

NimFeed is a Vue 3 + IndexedDB social client for Nimiq that publishes profile claims and posts on-chain, then builds local timelines by indexing chain data in the browser.

**Live:** [maestroi.github.io/NimFeed](https://maestroi.github.io/NimFeed/)

## What it does

- Connects through **Nimiq Pay** when opened as a mini app, with **Nimiq Hub**
  fallback in normal browsers.
- Claims usernames (`PROFILE_CLAIM`) with earliest-claim-wins resolution.
- Publishes posts as:
  - `POST_INLINE` for short text
  - `POST_START` + `POST_CHUNK` for larger payloads
- Supports follow/unfollow events and a following timeline.
- Shows thread/reply context.
- Lets users tip post authors with NIM (plain value transfer), with a
  wallet-balance check before sending.
- Feed loads more posts automatically via infinite scroll.
- Links each post to explorer block/transaction pages.

## Tech stack

- Vue 3 + Vue Router + Pinia
- Dexie (IndexedDB)
- `@nimiq/hub-api` (wallet signing)
- `@nimiq/mini-app-sdk` (Nimiq Pay detection and account access)
- Vite + Tailwind CSS
- Vitest + happy-dom + fake-indexeddb

## Quick start

### 1) Prerequisites

- Node.js 20+ (recommended)
- npm

### 2) Install

```bash
npm install
```

### 3) Configure environment

Create/update `.env.local`:

```env
VITE_NIMFEED_NETWORK=mainnet
VITE_NIMFEED_MAINNET_CATALOG_ADDRESS=NQ19 LLHP G0ML 37RM 5JJD RME1 GLFY 75PQ 402Y
VITE_NIMFEED_MAINNET_BOOTSTRAP_ADDRESS=NQ79 FEX6 3EN3 ALNX 9U6Y U7UB 4RHS 13SC 7Y1E
VITE_NIMFEED_DATA_RECIPIENT_ADDRESS=NQ79 FEX6 3EN3 ALNX 9U6Y U7UB 4RHS 13SC 7Y1E
```

Then run:

```bash
npm run dev
```

To test from Nimiq Pay on a phone connected to the same network:

```bash
npm run dev -- --host
```

Open the displayed network URL from Nimiq Pay's Mini Apps custom URL field.

## Available scripts

- `npm run dev` - start Vite dev server
- `npm run build` - production build (also copies `dist/index.html` to `dist/404.html`)
- `npm test` - run test suite once
- `npm run test:watch` - watch mode tests
- `npm run admin:bootstrap` - wallet/bootstrap CLI entrypoint

## Configuration reference

Environment variables consumed by the app:

- `VITE_NIMFEED_NETWORK` - `mainnet` or `testnet`
- `VITE_NIMFEED_MAINNET_CATALOG_ADDRESS`
- `VITE_NIMFEED_TESTNET_CATALOG_ADDRESS`
- `VITE_NIMFEED_MAINNET_FOLLOW_CATALOG_ADDRESS`
- `VITE_NIMFEED_TESTNET_FOLLOW_CATALOG_ADDRESS`
- `VITE_NIMFEED_MAINNET_BOOTSTRAP_ADDRESS`
- `VITE_NIMFEED_TESTNET_BOOTSTRAP_ADDRESS`
- `VITE_NIMFEED_DATA_RECIPIENT_ADDRESS`
- `VITE_NIMFEED_HUB_URL` (optional override)
- `VITE_NIMFEED_MAINNET_EXPLORER_BASE_URL` (default `https://nimiqscan.com`)
- `VITE_NIMFEED_TESTNET_EXPLORER_BASE_URL` (default `https://test.nimiq.watch`)

## High-level architecture

1. NimFeed initializes the Mini App SDK to detect a usable injected Nimiq Pay
   provider. If initialization fails or times out, it uses the browser Hub flow.
2. Nimiq Pay users share an account through the native provider; browser users
   connect by signing a Hub login message.
3. User signs transactions in Hub popup (private keys never sent to RPC).
4. App sends signed tx hex to RPC (`sendRawTransaction`).
5. Browser indexer syncs catalog/follow addresses from RPC.
6. Decoder/handlers persist events to IndexedDB (`catalog_refs`, `posts`, `users`, `follows`, etc.).
7. Feed/profile composables render timelines from local DB.

### Current Nimiq Pay limitation

NimFeed's original on-chain protocol uses binary transaction data. Nimiq Pay
posts use an ASCII `NFH:` envelope that carries the same protocol bytes through
`sendBasicTransactionWithData()`. Long posts use smaller chunks to stay within
the text transaction data limit.

Follows, unfollows, and tips work inside Nimiq Pay as plain/enveloped value
transfers. Profile claims and replies remain unavailable inside Nimiq Pay
until their larger metadata formats receive equivalent text-safe encodings.

Normal browsers retain full write support through Nimiq Hub.

Once deployed, the mini app can be opened with:

```text
nimiqpay://miniapp?url=https://maestroi.github.io/NimFeed/
```

Core folders:

- `src/protocol` - binary format, encoders/decoders, address utilities
- `src/indexer` - chain sync, event handling, chunk assembly
- `src/db` - Dexie schema + queries
- `src/components` - UI
- `src/composables` - feed, post, profile, follow flows

## Username claim semantics

- Username winner is the **earliest** claim by `(block_height, tx_index)`.
- UI claim flow now checks conflicts:
  - pre-submit: blocks already-taken handles
  - post-submit: verifies you actually became winner after sync

## Debugging

### Profile diagnostics panel

On Profile page, tap the subtle `···` in the header to open **Diagnostics**:

- network/rpc/explorer/catalog addresses
- local DB counts
- `sync_state` rows for indexer scopes
- refresh diagnostics button
- `logs: on/off` toggle for `[NimFeed debug]` console logs

### Console debug logs

In dev mode, feed/indexer logs are gated by `localStorage` key:

- key: `nimfeed_debug_logs`
- values: `1` (on) / `0` (off)

Use the diagnostics toggle instead of setting this manually.

## Local node (optional)

A Docker Compose config is included to run a local Nimiq node (`docker-compose.yml`), exposing RPC at `http://localhost:8648`.

## Tests

Run:

```bash
npm test
```

Test environment:

- `happy-dom`
- `fake-indexeddb`

## Related docs

- [Design spec](docs/superpowers/specs/2026-05-05-nimfeed-design.md)
- [Phase 1 plan](docs/superpowers/plans/2026-05-05-nimfeed-phase1.md)
- [Phase 2 plan](docs/superpowers/plans/2026-05-05-nimfeed-phase2.md)
- [Phase 3 plan](docs/superpowers/plans/2026-05-05-nimfeed-phase3.md)
- [Admin bootstrap CLI](docs/operations/2026-05-05-admin-bootstrap-cli.md)
- [Wallet operations](docs/operations/2026-05-05-wallet-operations.md)
