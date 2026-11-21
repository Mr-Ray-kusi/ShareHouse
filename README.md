# ShareHouse

Multi-tenant welfare distribution SaaS for Ghanaian tertiary SRCs. SRC administrators upload student lists, send assistants into the field with unique join links, and watch collections live so the same student cannot collect twice.

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router v6
- **Backend:** Node.js, Express, Supabase (Postgres)
- **Auth:** JWT access tokens + httpOnly refresh cookies
- **Payments:** Paystack initialize + `charge.success` webhook
- **Uploads:** Multer + SheetJS (`xlsx`)
- **Live desk:** Socket.IO activity feed

## Tenant model

Every hall/SRC is a tenant (`tenantId` slug, e.g. `atlantic-hall-knust`). Users, beneficiaries, distributions, collections, and invites are scoped to that id. MVP routing uses the path `/app` after login; the slug is stored on the tenant and shown in the desk (`/{tenant-slug}`).

## Roles

| Role | Can |
| --- | --- |
| Super admin | All accounts, campaign revenue, activate/deactivate, Support Mode (view-only) |
| Tenant admin | Own SRC account: distributions, Excel upload, assistant invites, live desk |
| Assistant | Join link only: search + mark received. No menu, reports, or settings |

Super admins **cannot** create distributions or mark beneficiaries, including in Support Mode.

Each account supports up to two active device sessions. Signing in on another device replaces the oldest session, which is denied on its next authenticated request. The API also retains its separate sign-in attempt rate limit.

## Core records

1. **Tenant** — SRC profile, account status, school and administrator details
2. **User** — `super_admin` / `tenant_admin` / `assistant`, refresh token hashes
3. **Distribution** — sharing event; only one `active` per tenant
4. **CampaignPayment** — verified Paystack charge, reference, student count, and amount
5. **Beneficiary** — list row for a distribution (index, name, level, phone)
6. **Collection** — unique `(distributionId, beneficiaryId)` mark, with assistant + timestamp
7. **Invite** — `/join/ATL-89XK2` codes with hashed passwords; revoke disables the assistant
8. **Supporting records** — uploads, walk-in exceptions, collection voids, and system events

## Campaign pricing

Creating an SRC account and uploading a list are free. Campaign activation is charged at **GHS 0.05 per student** (5 pesewas per list row). The API counts the saved beneficiaries and calculates the amount in pesewas; a campaign remains inactive until Paystack confirms the exact amount, currency, campaign, and student count. A successful verified payment activates the campaign.

Changing the number of people on an active campaign pauses it. A new payment matching the updated list is required before it can be activated again. List changes are blocked while a Paystack checkout is pending.

## Local setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard SQL Editor, run `backend/supabase/schema.sql`. On an existing project, run `backend/supabase/campaign-billing.sql` and `backend/supabase/share-day.sql`.
3. Copy env files and fill in the project URL plus the **service role** key (Settings → API). Never put that key in the frontend.

```bash
cp backend/.env.example backend/.env
```

4. Put your Paystack test keys in `backend/.env`. They are needed when activating a campaign, not when creating an account.
5. Install and run (two terminals):

```bash
cd backend
npm install
npm run dev

cd frontend
npm install
npm run dev
```

- API: http://localhost:5000/api/health  
- Web: http://localhost:5173  

Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `backend/.env` (local) and on the API host (production). Those values are never committed. The API creates or updates the single system admin on boot and disables any previous default accounts.

## Paystack webhook

Point Paystack to:

`POST https://<your-api-host>/api/payments/webhook`

Events used: `charge.success`. The signature header `x-paystack-signature` is verified with HMAC SHA512. Payment references are tied to the tenant and campaign; the amount, GHS currency, and current beneficiary count are checked before activation. The frontend callback at `/payment/callback` verifies the reference as a backup.

## Excel columns

`Student Index`, `Full Name`, `Level`, `Phone` (header names are matched flexibly).

## Deploy

- **Database:** Supabase — run `backend/supabase/schema.sql` (or `backend/supabase/campaign-billing.sql` for an existing database), then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API host
- **API:** Render or Railway — set env vars from `backend/.env.example`, start command `npm start`, health `/api/health`
- **Web:** Vercel or Netlify — build `npm run build`, output `dist`, set `VITE_API_URL` to the public API origin
- Frontend `vercel.json` rewrites all routes to `index.html`

Set `FRONTEND_URL` on the API to the deployed web origin, `COOKIE_SECURE=true`, and strong JWT secrets. The frontend still talks only to your API, not directly to Supabase.

## Google Analytics through Google Tag Manager

The frontend loads the Google Tag Manager container `GTM-M2D8LCBX` and sends a `sharehouse_page_view` data-layer event on each in-app route change. The event includes the path (without query parameters) and document title, so payment references in callback URLs are not sent as page-view data.

To see these events in Google Analytics, publish a GA4 Google tag in that GTM container using your GA4 Measurement ID, then create a GA4 Event tag triggered by the custom event name `sharehouse_page_view`. Disable automatic page-view sending on the Google tag to avoid duplicate page views. The GTM container ID is not a GA4 Measurement ID.
