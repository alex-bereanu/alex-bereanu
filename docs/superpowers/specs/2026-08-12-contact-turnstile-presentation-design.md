# Contact Turnstile Presentation Design

## Goal

Keep Cloudflare Turnstile protection on the contact form without permanently displaying the full-size verification widget.

## Design

- Configure only the contact form's Turnstile instance with Cloudflare's `interaction-only` appearance.
- Use Cloudflare's supported `compact` size when an interactive challenge must be shown.
- Center the challenge within the contact form's full-width grid row.
- Leave the shared Turnstile component's current behavior as the default so booking, gallery, setup, and login forms are unchanged.

## Behavior

- Most visitors receive a verification token without seeing a widget or an empty reserved space.
- Visitors who require an interactive challenge see the compact 150-pixel-wide widget centered below the message field.
- Token submission, expiration handling, error handling, reset behavior, and server-side Siteverify validation remain unchanged.

## Verification

- Run the project's lint and TypeScript checks.
- Inspect the contact form at a mobile viewport and confirm the normal successful verification state does not display the full-size widget.
- Confirm the contact form's challenge container spans the form grid and centers any widget that Cloudflare displays.
- Confirm other Turnstile consumers retain their existing default rendering behavior.
