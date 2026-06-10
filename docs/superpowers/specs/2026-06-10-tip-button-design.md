# Tip/Donate button for feed posts

## Goal

Let a logged-in user send a NIM "tip" to a post's author directly from the
feed, working in both the browser/Hub flow and inside the Nimiq Pay mini app.

## Scope

- Plain NIM transfer to the author's address. No new on-chain protocol type,
  no decoder/indexer changes, no memo. Tips do not appear as feed events —
  they're just a balance transfer the recipient sees in their wallet.
- Also fixes the "Reply" button being hidden inside Nimiq Pay (same root
  cause as the Follow button fix earlier this session).

## Components

### `src/protocol/constants.js`

Add:

```js
export const LUNA_PER_NIM = 100000
```

### `src/composables/useDonate.js` (new)

Mirrors `useFollow.js`'s wallet-agnostic send pattern:

```js
export function useDonate(recipientAddress) {
  const auth = useAuthStore()
  const hub = useHub()
  const walletRuntime = getWalletRuntime()
  const pending = ref(false)
  const error = ref(null)

  async function sendTip(amountNim) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const valueLuna = Math.round(Number(amountNim) * LUNA_PER_NIM)
    if (!Number.isFinite(valueLuna) || valueLuna <= 0) {
      throw new Error('Enter a valid amount')
    }

    if (walletRuntime.isNimiqPay.value) {
      await walletRuntime.sendMiniAppTransaction({
        recipient: recipientAddress,
        value: valueLuna,
        fee: 0,
      })
    } else {
      walletRuntime.assertBinaryTransactionsSupported()
      const height = await rpc.getBlockNumber()
      const signed = await hub.signTransaction({
        sender: auth.address,
        recipient: recipientAddress,
        value: valueLuna,
        fee: 0,
        validityStartHeight: height,
      })
      await rpc.sendRawTransaction(signed.serializedTx)
    }
  }

  async function tip(amountNim) {
    if (pending.value) return
    pending.value = true
    error.value = null
    try {
      await sendTip(amountNim)
    } catch (e) {
      error.value = e?.message || 'Failed to send tip'
      throw e
    } finally {
      pending.value = false
    }
  }

  return { pending, error, tip }
}
```

`recipientAddress` is a plain string (the post author's address — not a
ref, since `TipModal` receives a fixed target when opened).

### `src/stores/ui.js`

Add a `tipTarget` ref, following the existing `loginModalOpen` /
`composerReplyTo` pattern:

```js
/** @type {import('vue').Ref<{ address: string, label: string|null } | null>} */
const tipTarget = ref(null)
```

Exported alongside the others.

### `src/components/post/TipModal.vue` (new)

Modal mounted in `AppShell.vue` next to `<LoginModal />`, visible when
`ui.tipTarget` is non-null.

- Header: "Send a tip" + recipient `AddressIdenticon` + address/username
  (`tipTarget.label ?? tipTarget.address`)
- Preset amount chips: `100`, `1,000`, `10,000`, `50,000` NIM (tappable,
  highlights selection)
- Custom amount number input (overrides preset selection when filled)
- "Send" button: disabled while `pending`, calls
  `useDonate(tipTarget.address).tip(amount)`
- On success: close modal (`ui.tipTarget = null`), no toast needed (existing
  app doesn't have a toast system — keep consistent)
- On error: show `error.value` inline, modal stays open
- "Cancel" button closes without sending
- Reuses existing modal styling conventions from `LoginModal.vue`

### `src/components/feed/PostCard.vue`

- Add `isSelf = computed(() => auth.address === props.post.author)`
- New "Tip" button in the action row (next to "Reply"):
  ```html
  <button
    v-if="!isSelf && walletRuntime.canPublishPosts.value"
    type="button"
    class="nf-focus font-semibold hover:text-[var(--nf-primary)]"
    @click="ui.tipTarget = { address: post.author, label: authorLabel }"
  >
    Tip
  </button>
  ```
- Fix "Reply" button visibility: change
  `v-if="walletRuntime.canWriteBinaryTransactions.value"` to
  `v-if="walletRuntime.canPublishPosts.value"` (the actual send path,
  `usePost.js`'s `sendPayload`, already supports both wallets — this was
  just an overly strict UI gate, same issue Follow had).

## Testing

- `tests/composables/useDonate.test.js`: mirrors
  `useFollow.runtime.test.js` — covers (a) Hub/browser path calls
  `signTransaction` + `sendRawTransaction` with the right `value` (NIM →
  luna conversion), (b) Nimiq Pay path calls `sendMiniAppTransaction`
  with the right `value`, (c) rejects invalid/zero amounts before signing,
  (d) rejects when binary writes unavailable and not in Nimiq Pay.
- No new indexer/decoder/encoder tests needed (out of scope).

## Out of scope / explicitly deferred

- Tips as feed events / on-chain memo / "X tipped Y" badges.
- Notifications to the recipient.
- Currency conversion display (EUR estimate next to NIM amount).
