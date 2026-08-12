# Mobile Inline Navigation Design

## Goal

Keep the public-site navigation visible beneath the “Alex Bereanu” brand on mobile, matching the desktop header structure and eliminating the side-menu interaction.

## Design

`SiteHeader` will render one primary navigation for every viewport. The brand remains centered above the navigation links. On screens at or below 768px, the header stays vertically stacked and all navigation links remain visible on one centered row without horizontal scrolling.

The mobile menu button, portal-based drawer, overlay, focus-management state, and body-scroll locking will be removed because they are no longer used. Existing link rendering, routes, desktop typography, interaction states, and the primary navigation accessible label remain unchanged.

Mobile link typography and spacing will scale down responsively so all six links fit at supported phone widths. The 44px coarse-pointer touch targets remain intact. The active, hover, or focus underline will be positioned relative to the visible label rather than the full touch target, leaving approximately 1–2px between the text and line.

## Responsive Behavior

- Desktop: preserve the current centered brand and single-row centered navigation.
- Mobile: preserve the same order, with the centered navigation immediately beneath the centered brand.
- Narrow mobile: keep all six links on one centered row using responsive mobile-only font sizing and tighter gaps; do not clip links or introduce horizontal scrolling.
- Mobile underline: preserve the full touch target while moving the visible highlight line close to the text.

## Verification

- Extend the focused source-level regression check to require non-wrapping responsive mobile typography and mobile underline positioning close to the label.
- Run lint and TypeScript checks.
- Build the production application.
- Inspect the header at desktop and representative mobile viewport widths, confirming that no menu trigger or side drawer appears, all links remain on one row beneath the brand, no horizontal overflow occurs, and the underline is visually close to the label.

## Scope

Only the public `SiteHeader` component and its associated global header styles are in scope. Navigation destinations, page content, footer behavior, and admin navigation are unchanged.
