# NimFeed Nimiq UI Kit Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align NimFeed's full user interface with the local Nimiq UI Kit while preserving its existing wallet, protocol, indexing, and social behavior.

**Architecture:** Keep Vue 3 and Tailwind 4, define kit-accurate visual primitives in `src/style.css`, and add one behavior-owning `NqDialog.vue` component for all overlays. Migrate existing screens onto those primitives in reviewable groups without adding `@nimiq/vue-components` or changing application data flows.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS 4, Vite 8, Vitest 4, happy-dom, local `/home/maestro/Documents/projects/nimiq-ui-kit` artifacts.

## Global Constraints

- Treat `/home/maestro/Documents/projects/nimiq-ui-kit` as the source of truth when generic UI guidance conflicts.
- Keep `html { font-size: 16px }`; translate the kit's 8px-root values into app-local values.
- Use Muli for interface copy and Fira Mono only for technical values.
- Use an 8px spacing rhythm, 10px cards, 4px fields where practical, and 500px pill buttons.
- Do not add `@nimiq/vue-components` or change wallet, protocol, indexing, routing, or transaction behavior.
- Preserve and incorporate the existing uncommitted UI changes; never reset or replace them wholesale.
- Maintain browser/Hub and Nimiq Pay conditional behavior and safe-area support.

---

### Task 1: Kit-Accurate Foundations And Visual Primitives

**Files:**
- Modify: `src/style.css`
- Create: `tests/components/nimiqUiPrimitives.test.js`

**Interfaces:**
- Consumes: canonical token values from `nimiq-ui-kit/tokens/tokens.json`.
- Produces: `.nq-h1`, `.nq-h2`, `.nq-h3`, `.nq-text`, `.nq-text-s`, `.nq-label`, `.nq-button`, `.nq-button-s`, `.nf-button-quiet`, `.nf-icon-button`, `.nf-input`, `.nf-card`, `.nf-notice`, and status modifiers.

- [ ] **Step 1: Write the failing source-contract test**

```js
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8')

describe('Nimiq UI primitives', () => {
  it('uses canonical typography, radii, and controls', () => {
    expect(css).toContain('--nimiq-radius-card: 10px')
    expect(css).toContain('--nimiq-radius-input: 4px')
    expect(css).toMatch(/\.nq-h1[\s\S]*font-size:\s*24px/)
    expect(css).toMatch(/\.nq-h2[\s\S]*font-size:\s*20px/)
    expect(css).toMatch(/\.nq-h3[\s\S]*font-size:\s*16px/)
    expect(css).toMatch(/\.nq-button[\s\S]*min-height:\s*48px/)
    expect(css).toMatch(/\.nf-input[\s\S]*border-radius:\s*var\(--nimiq-radius-input\)/)
  })

  it('keeps visible focus and reduced motion support', () => {
    expect(css).toContain('.nf-focus:focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- tests/components/nimiqUiPrimitives.test.js`
Expected: FAIL because the canonical radius variables, `nq-h1`, and full primary button are absent.

- [ ] **Step 3: Implement the canonical foundation**

In `src/style.css`, replace approximate typography and decorative page gradients, add explicit canonical variables, and implement the produced classes. Keep compatibility aliases such as `--nf-text` so migration can be incremental. Ensure disabled controls do not lift on hover and use the official opacity ladder for neutral text.

```css
:root {
  --nimiq-radius-input: 4px;
  --nimiq-radius-card: 10px;
  --nimiq-radius-pill: 500px;
  --nimiq-shadow-card: 0 4px 28px rgba(0, 0, 0, 0.111158);
}

.nq-button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--nimiq-radius-pill);
  padding: 0 24px;
  font: inherit;
  font-weight: 700;
}
```

- [ ] **Step 4: Run focused and full verification**

Run: `npm test -- tests/components/nimiqUiPrimitives.test.js && npm test && npm run build`
Expected: all tests pass and Vite completes the production build.

- [ ] **Step 5: Commit**

```bash
git add src/style.css tests/components/nimiqUiPrimitives.test.js
git commit -m "feat: add Nimiq UI primitives"
```

### Task 2: Accessible Shared Dialog

**Files:**
- Create: `src/components/common/NqDialog.vue`
- Create: `tests/components/nqDialog.test.js`

**Interfaces:**
- Consumes: `open: boolean`, `title: string`, `description?: string`, `panelClass?: string`, `closeOnBackdrop?: boolean`.
- Produces: `close` event; default slot; `actions` slot; accessible dialog semantics and focus lifecycle.

- [ ] **Step 1: Write a failing component source test**

Test for `role="dialog"`, `aria-modal="true"`, title/description IDs, `@keydown.esc`, backdrop self-click, a close button with `aria-label="Close"`, focus restoration, and a Tab focus loop. Follow the `readFileSync` pattern used by existing component tests.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- tests/components/nqDialog.test.js`
Expected: FAIL because `src/components/common/NqDialog.vue` does not exist.

- [ ] **Step 3: Implement `NqDialog.vue`**

Use `Teleport` to `body`, `Transition`, `ref`, `watch`, `nextTick`, and `onBeforeUnmount`. Capture `document.activeElement` on open; focus the first enabled interactive element or panel; cycle Tab/Shift+Tab within the panel; restore focus after close. Lock body overflow while open and clean it up on unmount. The panel uses `max-width: 360px` by default, mobile viewport padding, shared `.nf-card`, and the `actions` slot.

- [ ] **Step 4: Verify behavior contracts**

Run: `npm test -- tests/components/nqDialog.test.js && npm run build`
Expected: PASS and no Vue template/compiler errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/NqDialog.vue tests/components/nqDialog.test.js
git commit -m "feat: add accessible Nimiq dialog"
```

### Task 3: Authentication And Transaction Dialogs

**Files:**
- Modify: `src/components/auth/LoginModal.vue`
- Modify: `src/components/auth/OnboardingFlow.vue`
- Modify: `src/components/post/TipModal.vue`
- Modify: `src/components/layout/AppShell.vue`
- Modify: `src/components/post/PostThreadView.vue`
- Create: `tests/components/dialogSurfaces.test.js`

**Interfaces:**
- Consumes: `NqDialog` props/events/slots and Task 1 control classes.
- Produces: kit-led login, onboarding, tipping, composer, and reply dialogs without changing existing state functions.

- [ ] **Step 1: Write failing migration tests**

Assert all five overlay owners import/use `NqDialog`; assert login retains both runtime-specific labels; assert errors use `role="alert"`; assert loading copy uses `aria-live="polite"`; assert tip amount input keeps `type="number"`, `min="0"`, and `step="any"`; assert no migrated file retains the repeated `fixed inset-0 z-50` overlay string.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- tests/components/dialogSurfaces.test.js`
Expected: FAIL because the overlays are still hand-built.

- [ ] **Step 3: Migrate login and onboarding**

Wrap the existing state branches in `NqDialog`. Use a 24px dialog display title class, 16px description, 48px `.nq-button.light-blue`, quiet cancel action, announced error/loading states, labelled username/display-name fields, and `autocomplete="username"`/`autocomplete="name"`. Preserve `connect()`, onboarding storage, sync, and runtime conditionals exactly.

- [ ] **Step 4: Migrate tip, composer, and reply overlays**

Use `NqDialog` for each overlay. Keep the tip calculations and send behavior unchanged; render presets as an `aria-label="Tip amount"` option group with `aria-pressed`. Keep composer/reply sizing via `panelClass="nf-dialog-wide"` and preserve all close handlers and reply context.

- [ ] **Step 5: Run focused and regression tests**

Run: `npm test -- tests/components/dialogSurfaces.test.js tests/components/miniAppWriteControls.test.js tests/composables/useDonate.test.js tests/composables/usePost.claimProfile.test.js && npm run build`
Expected: PASS with existing runtime labels and transaction behavior intact.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth src/components/post/TipModal.vue src/components/post/PostThreadView.vue src/components/layout/AppShell.vue tests/components/dialogSurfaces.test.js
git commit -m "feat: align NimFeed dialogs with Nimiq UI"
```

### Task 4: Feed, Composer, Search, And Profile Surfaces

**Files:**
- Modify: `src/components/feed/FeedView.vue`
- Modify: `src/components/feed/PostCard.vue`
- Modify: `src/components/feed/PostSkeleton.vue`
- Modify: `src/components/post/PostComposer.vue`
- Modify: `src/components/search/UserSearch.vue`
- Modify: `src/components/profile/ProfileCard.vue`
- Modify: `src/components/profile/ProfileView.vue`
- Create: `tests/components/nimiqSurfaceMigration.test.js`

**Interfaces:**
- Consumes: Task 1 primitives and existing component props/events.
- Produces: consistent content cards, segmented feed tabs, notices, fields, menus, empty states, and technical typography.

- [ ] **Step 1: Write the failing surface-contract test**

Assert feed tabs use a shared segmented-control class and `aria-pressed`; sync errors use a status/notice class; composer/profile/search fields use `.nf-input` with real labels or `aria-label`; cards use `.nf-card`; skeleton colors use opacity-ladder variables rather than `slate`; addresses and endpoints retain `.nf-mono`; error text is announced.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- tests/components/nimiqSurfaceMigration.test.js`
Expected: FAIL on the old one-off tab, skeleton, field, and status classes.

- [ ] **Step 3: Migrate feed and post surfaces**

Convert Global/Following into one segmented control with stable dimensions. Use notices for sync states/details, compact Nimiq buttons for post actions, canonical cards for posts, and opacity-ladder skeleton fills. Preserve pull-to-refresh, pagination, routes, and sync event wiring.

- [ ] **Step 4: Migrate composer, search, and profile surfaces**

Apply shared labels/fields/buttons/menus/cards. Keep identicons as the primary identity signal and `.nf-mono` for addresses/RPC diagnostics. Keep diagnostics visually subordinate with an inset notice/surface. Do not alter save, claim, follow, logout, RPC, copy, or reset handlers.

- [ ] **Step 5: Run component and full tests**

Run: `npm test -- tests/components/nimiqSurfaceMigration.test.js tests/components/feedSyncStatus.test.js tests/components/userSearch.test.js tests/components/miniAppWriteControls.test.js && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/feed src/components/post/PostComposer.vue src/components/search src/components/profile tests/components/nimiqSurfaceMigration.test.js
git commit -m "feat: align NimFeed content surfaces"
```

### Task 5: Shell, Wallet Control, And Navigation

**Files:**
- Modify: `src/components/layout/AppShell.vue`
- Modify: `src/components/layout/BottomNav.vue`
- Modify: `src/components/auth/WalletButton.vue`
- Modify: `src/chain/miniAppLayout.js`
- Modify: `tests/index.viewport.test.js`
- Create: `tests/components/nimiqShell.test.js`

**Interfaces:**
- Consumes: Task 1 controls, Task 2 dialog, existing `shellClasses(isMiniApp)` return object.
- Produces: bright stable shell, kit-led wallet menu, touch-safe navigation, safe-area-compliant layout.

- [ ] **Step 1: Extend failing viewport and shell tests**

Assert the nav retains Home, Search, create, and Profile; interactive targets expose stable 44px minimum dimensions; the create action remains conditional on `canPublishPosts`; the wallet trigger/menu use shared controls; mini-app nav padding retains `env(safe-area-inset-bottom)`; and the shell has no decorative radial background.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- tests/components/nimiqShell.test.js tests/index.viewport.test.js tests/components/miniAppWriteControls.test.js`
Expected: FAIL on old one-off shell and wallet/menu classes.

- [ ] **Step 3: Implement shell and navigation migration**

Use a quiet white/app-surface background, stable navigation grid tracks, canonical icon-button states, and safe-area-aware bottom padding. Keep route behavior, conditional write capability, and logged-in identicon state unchanged. Replace the text triangle with an existing icon asset or a CSS-accessible familiar chevron; retain an accessible label.

- [ ] **Step 4: Verify shell regressions**

Run: `npm test -- tests/components/nimiqShell.test.js tests/index.viewport.test.js tests/components/miniAppWriteControls.test.js && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout src/components/auth/WalletButton.vue src/chain/miniAppLayout.js tests/index.viewport.test.js tests/components/nimiqShell.test.js
git commit -m "feat: align NimFeed shell and navigation"
```

### Task 6: Browser Verification And Cleanup

**Files:**
- Modify only if defects are found: migrated files from Tasks 1-5
- Create: `docs/verification/2026-07-11-nimiq-ui-kit-alignment.md`

**Interfaces:**
- Consumes: the complete migrated interface.
- Produces: recorded viewport/state evidence and a clean build/test result.

- [ ] **Step 1: Start the development server**

Run: `npm run dev -- --host 127.0.0.1`
Expected: Vite prints an available local URL; keep the process running for browser checks.

- [ ] **Step 2: Inspect representative viewports**

Using Playwright, capture 320x700, 390x844, 768x1024, and 1440x1000 screenshots for feed, login, search, profile, composer, thread/reply, and tip states. Check actual pixel content is nonblank and inspect for overlap, clipping, unintended scroll, unstable dialog height, and safe-area collision.

- [ ] **Step 3: Verify keyboard and state behavior**

For each dialog, verify initial focus, Tab containment, Shift+Tab containment, Escape close, backdrop close policy, focus restoration, and visible focus rings. Verify loading, disabled, empty, success, warning, and error states; check errors are announced and both Hub and Nimiq Pay labels remain represented in tests.

- [ ] **Step 4: Fix discovered defects and rerun affected checks**

Limit fixes to the migrated UI surface. Re-capture any failed viewport/state after each correction and record the final result in the verification document with viewport, route/state, and pass/fail notes.

- [ ] **Step 5: Run final verification**

Run: `git diff --check && npm test && npm run build`
Expected: no whitespace errors, all tests pass, and production build succeeds.

- [ ] **Step 6: Commit verification and final corrections**

```bash
git add src tests docs/verification/2026-07-11-nimiq-ui-kit-alignment.md
git commit -m "test: verify Nimiq UI alignment"
```

