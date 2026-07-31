# R2 Storage, CORS, and Lifecycle Policy

## Bucket boundary

- Public bucket: only approved, versioned portfolio derivatives and public site-content assets. Serve through the exact custom asset hostname in `R2_PUBLIC_BASE_URL`.
- Private bucket: client originals, client derivatives, archives, and private quarantine. It must have no `r2.dev` exposure, public custom domain, anonymous object policy, or public listing.
- Use distinct bucket names and least-privilege production credentials. Rotate keys after operator changes and incidents.

## CORS

Use exact production/staging origins; never `*` for origins. The private bucket needs browser `PUT` only for the direct upload and multipart flows. Allow only `Content-Type`, `x-amz-meta-upload-session-id`, `x-amz-meta-expected-sha256`, and the AWS signing headers actually observed in staging. Expose `ETag` only if the client workflow requires it. Private object `GET` is delivered through the authenticated application/edge boundary, not anonymous CORS.

Example policy shape (replace example origins before applying):

```json
[
  {
    "AllowedOrigins": ["https://domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "Content-Type",
      "x-amz-content-sha256",
      "x-amz-meta-upload-session-id",
      "x-amz-meta-expected-sha256"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

The public asset bucket normally needs no CORS for standard image display. If canvas/export creates a requirement, add exact read origins and `GET`/`HEAD` only after testing; do not reuse the upload policy.

## Lifecycle and cache

- Abort incomplete multipart uploads after seven days at the bucket layer as defense in depth.
- Delete quarantine objects after the application reconciliation window, while preserving enough time for failed-job investigation.
- Public derivatives use versioned immutable keys and long-lived CDN caching.
- Private media responses are authenticated, `private, no-store`, `Vary: Cookie`, noindex, and no-referrer.
- Recovery versions follow the approved backup window and deletion-ledger reconciliation.

## Verification

Before launch and quarterly: export bucket settings; prove private anonymous `GET` and listing fail; test disallowed origin/method/header preflights; confirm only approved public derivatives exist publicly; verify multipart lifecycle; rotate a test credential; revoke a share and confirm private delivery stops. Store sanitized configuration evidence with the release record.

