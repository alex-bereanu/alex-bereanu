# Backup and Restore Runbook

## Objectives

Protect gallery metadata, access-control state, processing/deletion queues, and irreplaceable media while ensuring that deleted personal data is not silently resurrected. Recovery targets must be agreed with the studio owner and recorded in the deployment checklist; a suggested starting point is a 24-hour recovery-point objective and a four-hour recovery-time objective.

## Backup controls

- Enable managed PostgreSQL point-in-time recovery with a 30-day rolling window and encryption at rest.
- Export an encrypted logical schema/data backup before every production migration. Store it outside the application runtime account and restrict restore permission.
- Enable the approved R2 recovery/versioning mechanism and a 30-day lifecycle for recovery versions. Public and private buckets remain separate.
- Back up configuration manifests and infrastructure policy, never plaintext secrets. Secrets must be reproducible from the approved secret manager.
- Maintain a deletion ledger from completed audit/deletion events so restored databases or object versions can be reconciled before reopening access.
- Test provider account recovery, MFA recovery, and emergency ownership contacts at least quarterly.

## Quarterly restore drill

1. Open a change/incident record and select an isolated account, network, database, and private R2 test bucket.
2. Capture the source backup identifiers, time, and expected record/object counts. Do not use a developer laptop as the restore destination for real client media.
3. Restore PostgreSQL to the chosen point and verify schema migration history before starting the application.
4. Restore a small approved set of public and private test objects. Keep the restored private bucket without a public domain.
5. Apply every deletion-ledger entry newer than the restore point before enabling application access.
6. Rotate environment secrets and use staging-only OAuth/Turnstile/email credentials.
7. Run authorization-negative tests: private object without grant, expired/revoked share, cross-gallery asset, original download, and admin-session revocation.
8. Run integrity checks for object size/checksum, derivative readiness, processing jobs, deletion jobs, ticket/message relations, and audit retention.
9. Measure actual recovery point and elapsed recovery time. Record gaps, owners, and deadlines.
10. Destroy the isolated restored environment and confirm deletion through both providers.

## Production restoration

- Require two-person approval when another authorized operator exists; otherwise document explicit owner approval.
- Freeze writes and worker/cron execution before selecting the recovery point.
- Preserve incident evidence separately; never paste tokens, database URLs, signed media URLs, or personal content into the ticket.
- Restore database and storage into isolated targets first. Reconcile deletion ledger and key rotations before routing traffic.
- Validate migrations with `prisma migrate status`, run the full release gate, then run `node scripts/verify-deployment.mjs https://…`.
- Re-enable traffic gradually, then workers and scheduled reconciliation. Monitor failed jobs, pending deletions, authentication denials, and Web Vitals.

## Failure and rollback

If integrity, authorization, or deletion reconciliation fails, keep the restored service inaccessible, preserve logs, revert traffic to the last known-safe environment, and escalate under the incident-response runbook. A successful database query alone is not a successful restore.

