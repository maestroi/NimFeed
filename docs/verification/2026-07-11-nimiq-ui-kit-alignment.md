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
| Composer dialog | Live Pinia state on `/` | Pass; modal is 294 px tall at 320x700 and 302 px at 1440x1000. |
| Thread / reply | `/thread/NQ00...0000/0000000000000000` | Pass; loading and missing-thread states render without overflow. Reply uses the same verified wide composer dialog primitive. |
| Tip | Live Pinia target on `/` | Pass; presets, custom input, disabled/pending affordances and cancel action fit. Panel is 422.5 px tall at 320x700. |

Representative files include `feed-320x700.png`, `login-390x844.png`, `search-1440x1000.png`, `composer-dialog-320x700.png`, `thread-768x1024.png`, and `tip-320x700.png`. The directory contains 32 PNG captures covering the complete matrix.

## Dialog Keyboard Verification

The login dialog was exercised at every viewport:

- Initial focus: close button (`aria-label="Close"`).
- Tab from the last control wraps to the first control.
- Shift+Tab from the first control wraps to the last control.
- Escape closes the dialog.
- Backdrop click closes the dialog, matching its default policy.
- Focus returns to the Profile trigger after close.
- The focused close button has a visible Nimiq light-blue focus ring in captured evidence.

The first run found that initial focus landed on the dialog panel. `focusableElements()[0]?.focus() ?? panel.value?.focus()` always evaluated the fallback because `focus()` returns `undefined`. A regression test was added first, observed failing, then `NqDialog` was corrected to use an explicit branch. The browser matrix passed after recapture.

## State And Accessibility Coverage

- Browser evidence covers populated feed/search, loading and missing thread/profile, anonymous disabled composer, selected tip preset, and login/modal states.
- `aria-live` / `role="alert"` error surfaces and success, warning, loading, disabled, empty, and error variants remain covered by the component and migration test suites.
- Both `Connect Nimiq Pay` and `Connect with Nimiq Hub` labels are asserted by `tests/components/dialogSurfaces.test.js`; runtime selection is covered by `tests/chain/walletRuntime.test.js`.

## Limitations

- No real Hub popup or injected Nimiq Pay wallet was authorized. Transaction success/error UI was verified through deterministic component tests and source-backed state coverage, not a live signed transaction.
- The thread fixture address has no matching post, so the browser captured loading/missing-thread behavior; the reply modal shares the same `NqDialog` and `PostComposer` surfaces exercised independently.
- Safe-area CSS was inspected and compact mobile bounds were measured, but Chromium desktop emulation does not synthesize a physical device notch.

## Commands

```text
npm test -- --run tests/components/nqDialog.test.js   # red: 1 failed, then green: 3 passed
python3 /tmp/nimfeed_verify.py                        # 32 screenshots and keyboard/state metrics
git diff --check                                       # passed
npm test                                               # 153 passed, 3 unrelated failures (below)
npm run build                                          # passed
```

The full suite's three stable pre-existing contract failures are outside this UI task: `tests/protocol/encoder.test.js` expects a 64-byte profile claim but receives 17 bytes; `tests/composables/usePost.claimProfile.test.js` expects binary-write rejection but reaches profile confirmation; and `tests/chain/walletRuntime.test.js` expects its mocked signing address but receives the derived address. The focused dialog suite passes 3/3. No protocol, wallet, or profile behavior was changed during this cleanup.
