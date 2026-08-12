# Mobile Inline Navigation Design

## Goal

Keep the public-site navigation visible beneath the “Alex Bereanu” brand on mobile, matching the desktop header structure and eliminating the side-menu interaction.

## Design

`SiteHeader` will render one primary navigation for every viewport. The brand remains centered above the navigation links. On screens at or below 768px, the header stays vertically stacked and all navigation links remain visible on one centered row without horizontal scrolling.

The mobile menu button, portal-based drawer, overlay, focus-management state, and body-scroll locking will be removed because they are no longer used. Existing link rendering, routes, desktop typography, interaction states, and the primary navigation accessible label remain unchanged.

Mobile link typography and spacing will scale responsively so all seven links fit at supported phone widths. The font will use `clamp(0.48rem, 2.4vw, 0.62rem)`, producing 7.68px at 320px and 9.36px at 390px. The gap will use `clamp(0.2rem, 1.1vw, 0.45rem)`, producing 3.52px at 320px and 4.29px at 390px. The 44px coarse-pointer touch targets remain intact. The active, hover, or focus underline remains positioned relative to the visible label, leaving approximately 1–2px between the text and line.

## Responsive Behavior

- Desktop: preserve the current centered brand and single-row centered navigation.
- Mobile: preserve the same order, with the centered navigation immediately beneath the centered brand.
- Narrow mobile: keep all seven links on one centered row using the approved responsive mobile-only font sizing and gaps; do not clip links or introduce horizontal scrolling.
- Mobile underline: preserve the full touch target while moving the visible highlight line close to the text.

## Verification

- Extend the focused source-level regression check to require the approved non-wrapping responsive mobile typography and gap values while preserving the mobile underline position.
- Run lint and TypeScript checks.
- Build the production application.
- Inspect the header at 320px, 390px, and desktop widths, confirming that no menu trigger or side drawer appears, all links remain on one row beneath the brand, no horizontal overflow occurs, the typography is larger at common phone widths, and the underline remains visually close to the label.

## Scope

Only the public `SiteHeader` component and its associated global header styles are in scope. Navigation destinations, page content, footer behavior, and admin navigation are unchanged.
