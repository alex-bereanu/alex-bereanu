# Admin OAuth Cookie Design

## Problem

Google OAuth completes successfully and creates an active database session, but the immediate redirect to `/admin` returns to the login page. The session cookie is stored with `SameSite=Strict`, so the browser withholds it during the redirect chain initiated by Google.

## Decision

Allow the shared secure-cookie helper to accept an explicit SameSite policy while keeping `strict` as its default. The Google OAuth callback alone will request `lax`, which permits the top-level return navigation. Password login, private-gallery access, and all other existing callers remain `strict`.

## Verification

A Node assertion test will prove that the default remains `strict` and the OAuth override produces `lax`. The complete OAuth flow must then land directly on `/admin` without a manual reload.
