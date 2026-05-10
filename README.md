# Alex Bereanu Photography Website

Next.js + Neon + Cloudflare R2 + Resend project for a professional photography platform.

## Chosen Stack

- Framework: Next.js 16 (App Router, TypeScript)
- Hosting target: Vercel
- Gallery stack: React Photo Album + Yet Another React Lightbox
- Storage: Cloudflare R2 (S3-compatible)
- Database: Neon Postgres via Prisma
- Email: Resend

## Implemented So Far

### Public site foundation

- Route structure:
  - `/`
  - `/portfolio`
  - `/portfolio/portraits`
  - `/portfolio/automotive`
  - `/portfolio/landscapes` (Places)
  - `/portfolio/weddings`
  - `/portfolio/product`
  - `/portfolio/corporate`
  - `/weddings`
  - `/g/[slug]`
- Booking form + Contact form with requested fields.
- Ticket creation APIs:
  - `POST /api/bookings`
  - `POST /api/contact`

### Admin panel workflows

- Initial admin account setup:
  - `/admin/setup`
  - `POST /api/admin/setup`
- Login/logout:
  - `POST /api/admin/login`
  - `POST /api/admin/logout`
  - `GET /api/admin/oauth/google`
  - `GET /api/admin/oauth/google/callback`
- Protected dashboard at `/admin`.
- Gallery management:
  - create, update, delete
  - gallery search/filter
  - custom share-link generation with optional password and expiry
  - optional share-link email send
- Asset management:
  - multi-file image upload (direct to R2 with signed URLs)
  - metadata finalize into Neon (`width`, `height`, `mimeType`, size, sort order)
  - drag-and-drop ordering persisted to `sortOrder`
  - hard-delete asset (R2 object + DB record)
- ZIP archive flow:
  - signed upload URL generation
  - client-side upload to R2
  - finalize + attach ZIP to gallery
  - hard-delete archive (R2 object + gallery metadata reset)
- Ticket operations:
  - status updates
  - admin email reply action
  - response thread rendering in admin
  - ticket filter/search

### Portfolio and client galleries

- `/portfolio` loads category summaries from DB with cover image + counts.
- Category pages load real public assets by category and open in lightbox.
- Lightbox integration includes zoom, thumbnails, and download plugin.
- `/g/[slug]` supports:
  - share-link lookup
  - optional password unlock
  - ZIP download (if attached)
  - preview grid/lightbox (when `R2_PUBLIC_BASE_URL` is configured)
  - per-asset original download URLs

## Environment Setup

Copy `.env.example` to `.env.local` and fill values. Prisma npm scripts in this repo automatically load `.env.local` (and `.env` if present).

For Google admin login, create a Google Cloud OAuth client of type "Web application" and add this authorized redirect URI:

```bash
https://your-domain.example/api/admin/oauth/google/callback
```

For local development, also add:

```bash
http://localhost:3000/api/admin/oauth/google/callback
```

Then set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `ADMIN_GOOGLE_ALLOWED_EMAILS` in `.env.local`. Use `GOOGLE_OAUTH_REDIRECT_URI` only if the app cannot infer the public callback URL from the incoming request.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:studio
```

## Next Phase (Deferred)

- Build the dedicated weddings one-page experience in detail.
- Perform final UI/brand polish pass after weddings page implementation.
