# External Penetration-Test Release Gate

Private client galleries must not launch until an independent qualified tester has assessed the deployed staging/production-equivalent system and every critical/high finding is resolved or explicitly risk-accepted by the owner with an expiry date.

## Required scope

- Admin Google OAuth, session creation/revocation, setup/password fallback closure, CSRF, and authorization boundaries.
- Gallery capabilities, password unlock, share expiry/revocation/versioning, download quotas, and cross-gallery access.
- Private original/derivative/archive delivery through application, CDN, R2 endpoints, optimizer paths, HTML, and RSC payloads.
- Trusted proxy/IP handling, distributed rate limits, forged forwarding headers, Turnstile action/hostname/token replay, and abuse controls.
- Upload URLs/sessions, cross-gallery finalization, MIME/signature/checksum/dimension limits, polyglots, malformed/pixel-bomb images, malicious archives, and scanner failure.
- CSP, CORS, security/private cache headers, OAuth redirects, open redirects, SSRF, injection, XSS, dependency exposure, and secret/log leakage.
- Deletion outbox interruption/retry, expired multipart cleanup, backup restoration, and deleted-data reconciliation.

## Rules of engagement

Use synthetic galleries and accounts, an isolated private bucket, agreed source IPs and test window, emergency stop contacts, rate limits, data-handling rules, and explicit prohibition on destructive production testing. Provide architecture, threat model, API inventory, roles, and the operational runbooks. Do not email real client photos or credentials to the tester.

## Acceptance

- Critical/high findings: fixed and retested, or accepted in writing by the owner and security lead with compensating controls, expiry, and tracked remediation.
- Medium findings: owner and due date assigned; launch acceptance documented.
- Report storage: encrypted, access restricted, retention agreed, and destroyed when no longer required.
- Evidence: final report version, retest letter, finding register, approvals, and scope exclusions attached to the release record.

This repository can prepare and verify the technical controls, but it cannot perform or certify an independent penetration test. Scheduling, contracting, and final risk acceptance remain external release actions.

