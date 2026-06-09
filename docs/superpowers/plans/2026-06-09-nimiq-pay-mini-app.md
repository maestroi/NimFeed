# Nimiq Pay Mini App Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable dual-runtime wallet behavior so NimFeed connects natively inside Nimiq Pay and preserves Hub behavior in normal browsers.

**Architecture:** A wallet runtime adapter owns Mini App SDK detection and account connection. Existing protocol-writing composables consult its binary-transaction capability before using Hub, because Nimiq Pay currently exposes text data rather than NimFeed's required arbitrary binary payloads.

**Tech Stack:** Vue 3, Pinia, Vite, Vitest, `@nimiq/hub-api`, `@nimiq/mini-app-sdk`

---

### Task 1: Add Runtime Detection And Connection Adapter

**Files:**
- Create: `src/chain/walletRuntime.js`
- Create: `tests/chain/walletRuntime.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Write failing tests proving successful SDK initialization selects Nimiq Pay, failed initialization selects browser fallback, account results are validated, and browser connection delegates to Hub.
- [ ] Run `npm test -- tests/chain/walletRuntime.test.js` and confirm failures are caused by the missing adapter.
- [ ] Install `@nimiq/mini-app-sdk` and implement a singleton runtime adapter exposing `initializeWalletRuntime()`, `getWalletRuntime()`, `connectWallet()`, and `assertBinaryTransactionsSupported()`.
- [ ] Run `npm test -- tests/chain/walletRuntime.test.js` and confirm all adapter tests pass.

### Task 2: Integrate Runtime With Login And Application Startup

**Files:**
- Modify: `src/components/layout/AppShell.vue`
- Modify: `src/components/auth/LoginModal.vue`
- Modify: `src/components/auth/WalletButton.vue`

- [ ] Add focused component/runtime tests where existing test infrastructure permits; otherwise cover decision logic through the adapter tests.
- [ ] Initialize detection during application startup without blocking indexing or rendering.
- [ ] Use Nimiq Pay account sharing for login when detected and retain Hub message signing in browsers.
- [ ] Change connection labels and waiting copy based on the active runtime.
- [ ] Run `npm test`.

### Task 3: Guard Binary Protocol Writes

**Files:**
- Modify: `src/composables/usePost.js`
- Modify: `src/composables/useFollow.js`
- Modify: `tests/composables/usePost.claimProfile.test.js`
- Modify: `tests/composables/usePost.chunked.test.js`
- Create: `tests/composables/useFollow.runtime.test.js`

- [ ] Write failing tests proving profile claims, posts, follows, and unfollows reject before Hub signing in Nimiq Pay.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add the runtime capability guard immediately before each write flow.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Document And Verify

**Files:**
- Modify: `README.md`

- [ ] Document dual-runtime behavior, the current Nimiq Pay read-only limitation, local WebView testing, and the `nimiqpay://miniapp` deeplink.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and `git status --short`.
