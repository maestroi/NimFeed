# NimFeed Nimiq UI Kit Alignment Design

## Goal

Make the local `/home/maestro/Documents/projects/nimiq-ui-kit` the visual and interaction source of truth for NimFeed. The result should feel related to Nimiq Wallet, Hub, and Keyguard while preserving NimFeed's compact social-feed structure and all existing application behavior.

## Scope

This pass covers the shared application shell and all currently active user-facing surfaces: feed and sync states, post cards, composer, thread and reply flow, search, profile and profile editing, wallet controls, login and onboarding, tipping, menus, and bottom navigation.

Protocol, wallet-runtime, indexing, routing, and data behavior are out of scope except where UI state or accessibility wiring requires a non-behavioral component change.

## Source Of Truth

1. Use `nimiq-ui-kit/tokens/tokens.json` and `tokens.css` for tokens and measurements.
2. Use `nimiq-ui-kit/llms-full.txt` for CSS component proportions and Wallet/Hub/Keyguard references.
3. Use `nimiq-ui-kit/components.json` to evaluate component behavior and naming.
4. Keep the existing Vue 3 and Tailwind 4 stack. Do not add `@nimiq/vue-components` in this pass.

When generic UI advice conflicts with the Nimiq kit, the Nimiq kit wins.

## Foundation

- Keep the app root at 16px and translate the kit's 8px-root measurements into explicit app-local pixel/rem values.
- Use Muli for interface text and Fira Mono only for addresses, hashes, endpoints, and other fixed-width technical values.
- Adopt the official Nimiq ink, action, status, opacity-ladder, gradient, motion, radius, and shadow tokens. Avoid parallel approximations such as arbitrary slate grays.
- Use an 8px spacing rhythm, with 4px only for tightly related micro-elements.
- Use the kit's 10px card radius, 4px input radius where practical, and 500px pill radius for primary and compact command buttons.
- Remove decorative page gradients and effects that are not part of the Nimiq product language. Surfaces remain bright, clean, and content-led.

## Local Primitives

Create a small set of local CSS/component primitives instead of repeating long Tailwind class strings:

- Typography: kit-accurate heading, body, small text, label, and mono styles.
- Buttons: primary pill, secondary/quiet pill, compact action, icon button, destructive state, disabled state, and loading state.
- Fields: text input and textarea with labels, help text, errors, focus treatment, and consistent height.
- Surfaces: card, inset/notice surface, divider, menu, and empty/loading state.
- Dialog: shared overlay and panel structure with title, description, close control, action area, and mobile-safe sizing.
- Status: success, warning, danger, and neutral notices using text/icon as well as color.

The primitives may remain CSS classes where no component behavior is needed. A Vue component is warranted for dialogs because focus, dismissal, semantics, and layout are shared behavior.

## Screen Treatment

### Login And Onboarding

The connection surface becomes a compact Nimiq dialog rather than a generic large card. It uses a 24px title, readable 16px explanation, one 48px primary action, a quiet cancel action, and a close icon. The content width stays approximately 320-360px with 24-32px internal spacing. Connecting, error, and onboarding states remain in the same stable panel so the layout does not jump unnecessarily.

### Feed And Navigation

Keep the feed information-dense. Headers, tabs, sync state, cards, and post actions use the same type ladder and shared controls. Tabs should read as a segmented choice, status details as a notice/inset region, and post actions as compact kit buttons. The bottom navigation remains touch-first with stable item dimensions and a visually distinct create action.

### Composer, Threads, And Tips

Composer fields use the shared field treatment. Character count, signing progress, and errors occupy reserved or stable space where possible. Reply and tip overlays use the shared dialog behavior. Amount choices are a clear option set, with NIM values formatted consistently and the final transaction action visually dominant.

### Search And Profiles

Search results, profile identity, account menus, editing controls, counters, RPC settings, and diagnostics use the shared surface hierarchy. Identicons remain the leading identity signal. Addresses and technical diagnostics use Fira Mono; ordinary metadata stays in Muli. Operator/debug information remains available but visually subordinate to profile content.

## Interaction And Accessibility

- Dialogs use `role="dialog"`, `aria-modal="true"`, labelled title/description, initial focus, focus containment, focus restoration, Escape dismissal, and intentional backdrop dismissal.
- Icon-only controls have accessible names and visible tooltips where their meaning is not obvious.
- Errors use `role="alert"` or an appropriate live region. Loading states announce changes without repeatedly interrupting screen readers.
- All interactive targets are at least 44px on touch layouts unless grouped compact controls have equivalent surrounding hit area.
- Focus indicators are visible and consistent. Hover behavior must not be required to understand or operate a control.
- Motion respects `prefers-reduced-motion`.
- Text and controls must remain readable at 320px width and must not collide with Nimiq Pay safe-area insets.

## Implementation Order

1. Align tokens and global foundations with the kit.
2. Add shared button, field, surface, status, icon-control, and dialog primitives.
3. Migrate login/onboarding and tip/reply dialogs first to validate the system.
4. Migrate shell, navigation, feed, cards, composer, search, and profiles.
5. Remove obsolete one-off style rules only after all call sites are migrated.

Existing uncommitted product changes must be preserved and incorporated rather than reverted.

## Verification

- Run the existing unit tests and production build.
- Add focused component tests for dialog dismissal, keyboard behavior, loading/error announcements, and critical conditional labels.
- Inspect the running app at 320px, 390px, 768px, and desktop widths.
- Compare the login/onboarding, feed, composer, tip, thread, search, and profile surfaces against the local UI kit references.
- Verify no overlap, clipping, layout shift from state changes, inaccessible contrast, missing focus state, or bottom safe-area collision.
- Confirm both browser/Hub and Nimiq Pay conditional UI remain intact.

## Success Criteria

- Nimiq kit tokens and proportions are visibly consistent across all primary surfaces.
- The login dialog no longer resembles the oversized generic card shown in the initial report.
- Repeated controls share a single local treatment instead of screen-specific approximations.
- Existing social, wallet, indexing, and transaction behavior is unchanged.
- Keyboard, touch, mobile safe-area, loading, empty, disabled, and error states are complete and usable.
