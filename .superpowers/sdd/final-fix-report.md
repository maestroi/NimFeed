# Final Nimiq UI Alignment Fix Report

## Scope

- Increased the rendered `NqDialog` close target from 40x40px to 44x44px.
- Ensured Login, Onboarding, and Tip cancel actions have a rendered minimum height of 44px.
- Gave all four Tip preset controls stable full-cell width and a 44px minimum height.
- Preserved existing labels, events, focus behavior, dialog flow, and Nimiq visual proportions.

## TDD Evidence

Red command:

```sh
npm test -- tests/components/nqDialog.test.js tests/components/dialogTouchTargets.test.js
```

Red result: 2 test files failed; 5 tests failed and 5 passed. The five expected failures covered the undersized close target, the three cancel targets, and the Tip presets. An initial harness-only indexer injection error was isolated before the clean red run.

Focused green command:

```sh
npm test -- tests/components/nqDialog.test.js tests/components/dialogTouchTargets.test.js tests/components/dialogSurfaces.test.js
```

Focused green result: 3 test files passed; 22 tests passed and 0 failed.

## Final Verification

- `npm test`: 31 test files passed; 163 tests passed and 0 failed.
- `npm run build`: passed; 119 modules transformed. Vite retained the pre-existing ineffective dynamic import warning for `PostComposer.vue`.
- `git diff --check`: passed with no output.

The new tests mount the Vue components in happy-dom and inspect the actual rendered buttons. Dimension declarations are read from each rendered element or a stylesheet rule that matches it, avoiding source-substring-only coverage.
