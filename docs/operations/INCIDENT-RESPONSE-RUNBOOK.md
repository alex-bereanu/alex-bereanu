# Security Incident Response Runbook

## Trigger conditions

Use this runbook for suspected private-media exposure, stolen credentials, unauthorized admin/gallery access, public private-bucket configuration, leaked signed URLs or object keys, malware/scanner bypass, deletion failure, suspicious download volume, or loss of database/R2/email/hosting control.

## First response

1. Appoint an incident owner and start a restricted incident record with timestamps.
2. Preserve provider audit logs and relevant keyed application audit events. Do not copy private photos, passwords, tokens, signed URLs, raw request bodies, or full database exports into chat or tickets.
3. Contain access: deactivate affected shares/galleries, revoke admin sessions, pause publishing/download routes if necessary, and remove any public route/domain from the private bucket.
4. Rotate credentials in dependency order: provider/root recovery, database, R2, OAuth, application session/HMAC secrets, worker/cron/health secrets, Turnstile, email, and monitoring webhook.
5. Deploy rotated configuration and verify old sessions, capabilities, upload URLs, and worker credentials no longer work.
6. Preserve deletion jobs and quarantine objects until evidence requirements are resolved; do not destroy evidence ad hoc.

## Severity

- **Critical:** confirmed private-photo disclosure, provider account takeover, active malicious admin, or broad secret compromise. Remove public access immediately and engage qualified incident/security counsel.
- **High:** credible unauthorized access attempt with a valid credential, private-bucket policy drift, scanner bypass, or persistent deletion failure.
- **Medium:** repeated Turnstile/CSP/rate-limit anomalies, isolated processing abuse, or non-sensitive availability degradation.
- **Low:** blocked probes, expired tokens, or policy violations with no evidence of access.

## Investigation questions

- Which identities, galleries, object variants, archives, and time windows are affected?
- Was content actually retrieved, or only addressable?
- Did HTML, RSC, logs, analytics, email, or CSP reports expose a token/key?
- Were shares revoked, expired, password-changed, or still active?
- Which provider logs independently corroborate access?
- Are backups, email-provider copies, or restored environments affected?
- Did monitoring or rate limiting fail, and could forwarding headers be forged?

## Notification and recovery

The owner must consult qualified privacy/security counsel and the applicable provider contracts to determine notification duties and deadlines. Communicate verified facts only; do not speculate or expose other clients. Before restoration, complete key rotation, negative authorization tests, storage-policy verification, queue reconciliation, dependency policy, and deployed-header checks.

## Closure

Document root cause, affected scope, evidence, notifications, containment, permanent fixes, deletion/recovery status, and follow-up owners. Add regression tests, revise threat models/runbooks, and hold a no-blame review. Critical/high incidents require an external security review before private-gallery access reopens.

