# Nimiq UI Kit Alignment Verification

Date: 2026-07-11

## Environment

- Local URL: `http://127.0.0.1:5178/` (Vite selected 5178 because 5173-5177 were occupied)
- Browser: system Playwright 1.52.0, headless Chromium
- Viewports: 320x700, 390x844, 768x1024, 1440x1000
- Evidence: [`evidence/2026-07-11/`](./evidence/2026-07-11/)

## Viewport And State Matrix

Each state below was captured at all four viewports. All captures rendered nonblank content and had `body.scrollWidth === innerWidth`. Visual inspection found no clipping, incoherent overlap, unintended page-level horizontal scrolling, or bottom-navigation collision.

| State | Route / setup | Result |
| --- | --- | --- |
| Feed | `/` | Pass; populated feed, sync status, tabs, promotions, cards, and fixed navigation rendered correctly. |
| Login | Profile button from `/` | Pass after focus correction; panel stays within viewport and safe-area padding. |
| Search | `/search` | Pass; populated and empty/search affordances remain readable from compact mobile through desktop. |
| Profile | `/profile/NQ00...0000` | Pass; missing-profile state is stable and nonblank. |
| Composer page | `/post` | Pass; anonymous/disabled page state is stable. |
| Composer dialog | Create-post button with deterministic authenticated Pinia state | Pass; actual AppShell owner, 294 px tall at 320x700 and 302 px at 1440x1000. |
| Thread / reply | Seeded post at `/thread/.../0102030405060708` | Pass; actual PostThreadView reply trigger and dialog owner render without overflow. |
| Tip | First feed-card Tip button with deterministic authenticated Pinia state | Pass; actual PostCard/TipModal owner, 422.5 px tall at 320x700. |

Representative route files include `feed-320x700.png`, `login-390x844.png`, `search-1440x1000.png`, and `thread-768x1024.png`. The retained 32-capture route/state matrix is supplemented by 10 owner-level dialog captures named `*-owner-320x700.png` and `*-owner-1440x1000.png`.

## Dialog Keyboard Verification

Every actual dialog owner was exercised at 320x700 and 1440x1000:

| Owner | Fixture / trigger | Focusables | Result |
| --- | --- | ---: | --- |
| LoginModal | Profile trigger | 3 | Pass |
| OnboardingFlow | LoginModal deterministically advanced to onboarding | 5 | Pass |
| AppShell global composer | Create-post trigger | 2 | Pass |
| PostThreadView reply | IndexedDB-seeded real post and Reply-to-thread trigger | 2 | Pass |
| TipModal | Real feed-card Tip trigger | 7 | Pass |

For every row:

- Initial focus: close button (`aria-label="Close"`).
- Tab from the last control wraps to the first control.
- Shift+Tab from the first control wraps to the last control.
- Escape closes the dialog.
- Backdrop click closes the dialog, matching its default policy.
- Focus returns to the Profile trigger after close.
- The focused close button has a visible Nimiq light-blue focus ring in captured evidence.

The first run found that initial focus landed on the dialog panel. `focusableElements()[0]?.focus() ?? panel.value?.focus()` always evaluated the fallback because `focus()` returns `undefined`. A regression test was added first, observed failing, then `NqDialog` was corrected to use an explicit branch.

The first owner-level onboarding run then found focus restoration targeted the outgoing login dialog's detached close button. A mounted replacement-dialog regression reproduced it. `NqDialog` now inherits the external focus origin from the outgoing live dialog element; the repeated onboarding owner run restores the Profile trigger on both viewports.

## State And Accessibility Coverage

- Browser evidence covers populated feed/search, loading and missing thread/profile, anonymous disabled composer, selected tip preset, and login/modal states.
- `aria-live` / `role="alert"` error surfaces and success, warning, loading, disabled, empty, and error variants remain covered by the component and migration test suites.
- Both `Connect Nimiq Pay` and `Connect with Nimiq Hub` labels are asserted by `tests/components/dialogSurfaces.test.js`; runtime selection is covered by `tests/chain/walletRuntime.test.js`.

## Limitations

- No real Hub popup or injected Nimiq Pay wallet was authorized. Transaction success/error UI was verified through deterministic component tests and source-backed state coverage, not a live signed transaction.
- Thread reply verification uses a deterministic post inserted into the app's real IndexedDB schema before opening the actual route and reply trigger.
- Safe-area CSS was inspected and compact mobile bounds were measured, but Chromium desktop emulation does not synthesize a physical device notch.

## Commands

```text
npm test -- --run tests/components/nqDialog.test.js   # 5 passed
python3 /tmp/nimfeed_verify.py                        # 32 screenshots and keyboard/state metrics
python3 /tmp/nimfeed_dialog_verify.py                 # 10 actual-owner screenshots/lifecycle records
git diff --check                                       # passed
npm test                                               # full suite passes
npm run build                                          # passed
```

Systematic debugging traced three failures to stale expectations after intentional existing changes: compact profile claims from `9ec3d5d`, Nimiq Pay profile transport from the same commit, and internal signing-address derivation/signing diagnostics. Tests now assert those current contracts without changing production protocol or wallet behavior.
