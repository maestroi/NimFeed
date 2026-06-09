# Nimiq Pay Mini App Compatibility Design

**Date:** 2026-06-09
**Status:** Approved

## Goal

Run the existing NimFeed web application inside Nimiq Pay while preserving the
normal browser experience and the existing on-chain NimFeed binary protocol.

## Runtime Detection

NimFeed will use `@nimiq/mini-app-sdk` initialization as the authoritative
runtime check:

- SDK `init({ timeout })` succeeds: runtime is `nimiq-pay`.
- SDK initialization times out or fails: runtime is `browser`.
- `window.nimiqPay` is only an immediate hint and is not trusted as proof that
  the Nimiq provider is usable.

Detection happens once per page session and is exposed through a focused wallet
runtime module. The browser application must remain usable while detection is
pending.

## Wallet Capabilities

The wallet runtime exposes capabilities rather than leaking provider-specific
details into components:

- Browser runtime:
  - Connect using Nimiq Hub message signing.
  - Sign NimFeed binary-data transactions using Nimiq Hub.
  - Broadcast signed transactions using the existing JSON-RPC client.
- Nimiq Pay runtime:
  - Connect using the injected provider's `listAccounts()`.
  - Keep feed, profile, indexing, and navigation fully available.
  - Do not publish profiles, posts, replies, follows, or unfollows.

Nimiq Pay's documented `sendBasicTransactionWithData()` accepts text data.
NimFeed events use exact binary payloads up to 64 bytes. Encoding those payloads
as text would change the protocol bytes, so write support must remain disabled
until the injected provider supports arbitrary binary transaction data.

## User Experience

Inside Nimiq Pay:

- The wallet button says `Connect Nimiq Pay`.
- Connecting requests the user's Nimiq accounts and selects the first account.
- Native account-sharing rejection is shown as an actionable error.
- Write controls remain visible but disabled where practical.
- Attempting a guarded write action explains that the current Nimiq Pay
  provider cannot publish NimFeed's binary on-chain events yet.
- No Hub popup is opened from the Nimiq Pay WebView.

In a normal browser, current Hub behavior remains unchanged.

## Architecture

Create `src/chain/walletRuntime.js` as the runtime boundary. It owns SDK
initialization, runtime state, account connection, provider error normalization,
and capability flags.

The existing `src/chain/hub.js` remains the browser transaction signer.
Composables continue to own protocol encoding and broadcasting, but check the
runtime's binary-transaction capability before signing. The login modal chooses
the correct connection flow using the runtime adapter.

## Error Handling

- SDK timeout means browser fallback, not a visible application error.
- Provider-returned `{ error: { message } }` results are converted to thrown
  errors.
- Empty account lists produce `No Nimiq Pay account was shared.`
- Binary write attempts in Nimiq Pay produce one consistent unsupported message.
- Browser Hub and RPC errors retain their current behavior.

## Testing

Focused unit tests cover:

- Successful SDK initialization selects Nimiq Pay.
- Failed or timed-out initialization selects browser fallback.
- Nimiq Pay account connection normalizes provider errors and empty accounts.
- Browser connection continues through Hub.
- Binary write actions reject before opening Hub or broadcasting in Nimiq Pay.

The full Vitest suite and production build must pass.
