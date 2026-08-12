# About Text Justification Design

## Goal

Improve the on-screen presentation of the homepage About Me body copy by justifying it on both mobile and desktop.

## Scope

- Add Tailwind's `text-justify` utility to the existing About Me body paragraph in `src/app/page.tsx`.
- Keep the About Me heading left-aligned.
- Preserve the current content, whitespace handling, typography, color, layout, and responsive breakpoints.
- Do not change other body copy, including the Contact section or admin preview.

## Verification

- Confirm the About Me paragraph includes `text-justify` with no responsive prefix, so it applies at every viewport width.
- Run the project's lint and TypeScript checks.
- Inspect the homepage at representative mobile and desktop viewport sizes to confirm the body copy is justified and the heading remains left-aligned.
