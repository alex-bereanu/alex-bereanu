# Retention and Deletion Policy

**Owner:** Studio owner / data controller  
**Review cadence:** Every six months and after any storage, email, analytics, or hosting-provider change  
**Applies to:** R2 objects, PostgreSQL records, email-provider copies, platform logs, monitoring events, and backups

## Principles

- Keep personal data only for an approved business, contractual, or legal purpose.
- Collect and log the minimum data necessary. Passwords, tokens, signed URLs, raw storage keys, image bytes, and full request bodies must never enter logs or security audit metadata.
- Client photographs are never deleted merely because an automated operational-retention timer elapsed.
- A legal hold pauses the affected deletion workflow and must be documented with an owner and review date.
- Access revocation and physical deletion are separate steps: access is blocked first, then durable deletion is reconciled and evidenced.

## Retention schedule

| Data | Active retention | Deletion rule | Backup/provider tail |
| --- | --- | --- | --- |
| Public portfolio derivatives | While approved for publication | Unpublish immediately; delete through the storage-deletion outbox | CDN caches expire by the immutable URL/version policy; old versions are lifecycle-deleted after approval |
| Private originals, derivatives, ZIP archives | Contract/project period plus the client-approved delivery window | Manual gallery/asset deletion only; revoke sessions/shares immediately and enqueue every object | Removed from normal backups at expiry; historic backups age out under the backup schedule |
| Quarantine uploads and incomplete multipart sessions | 24 hours for photos; 7 days for archives | Automated expiry reconciliation, multipart abort, and storage-deletion outbox | None beyond provider recovery/versioning window |
| Gallery share links and access grants | Until expiry or revocation | Revoke immediately; retain minimal database record only while needed for security investigation | Database backup tail |
| Contact/booking tickets | Recommended 730 days, subject to owner/legal approval | `TICKET_RETENTION_DAYS`; leave unset until approved | Database backup tail |
| Application email logs | 90 days | `EMAIL_LOG_RETENTION_DAYS=90` | Email provider must be configured to an equal or shorter operational retention where supported |
| Email-provider message copies | Provider minimum needed for delivery diagnostics, target no more than 30 days | Configure in provider account and document exceptions | Provider-controlled; verify contract/DPA |
| Security audit events | 365 days | `AUDIT_RETENTION_DAYS=365`; contains keyed hashes, not raw IP/email | Database backup tail |
| Rate-limit buckets | Reset window plus 24 hours | Automated daily pruning | None required |
| Completed processing/deletion jobs | 90 days | Automated daily pruning after completion | Database backup tail |
| Revoked/expired admin sessions | 30 days after expiry/revocation | Automated daily pruning | Database backup tail |
| Application/platform logs | Target 30 days | Configure at hosting/observability provider; prohibit sensitive payload capture | Provider-controlled |
| Database backups | Target 30-day rolling point-in-time recovery | Provider lifecycle expiration | Document immutable/locked copies separately if required |
| R2 recovery versions | Target 30 days where version recovery is enabled | Bucket lifecycle policy | Cloudflare-controlled |

## Deletion workflow and service objectives

1. Revoke gallery/share/admin access and disable public discovery immediately.
2. Commit the database tombstone/state change and enqueue every source, derivative, ZIP, and quarantine object in `StorageDeletionJob` in one transaction.
3. Attempt storage deletion immediately; retain failures as `PENDING` with a safe error class.
4. The media worker and daily operations task retry outstanding jobs. Alert when any deletion remains pending or the queue exceeds the monitoring threshold.
5. Target confirmed primary-object deletion within 24 hours. Record and investigate every breach of that objective.
6. CDN entries must use versioned URLs. Private responses are `no-store`; public obsolete versions expire through CDN and R2 lifecycle policy.
7. Provider backups age out on their configured schedule. Do not restore deleted personal data into normal production use; apply the deletion ledger immediately after any restoration.

## Data-subject and client requests

Authenticate the requester through an agreed channel, identify all galleries/tickets/email logs, record the approved scope, revoke access, execute deletion/export, verify providers, and record completion without copying the sensitive material into the audit record. Escalate unclear identity, ownership, contractual, or legal-hold questions to the owner and qualified counsel.

## Required evidence

- Database deletion/tombstone transaction ID or audit event.
- Storage-deletion job completion count and timestamp.
- Share/session revocation test.
- Provider lifecycle screenshots or exported configuration.
- Backup retention and most recent restore-drill record.
- Exception owner, reason, approval date, and expiry date.

