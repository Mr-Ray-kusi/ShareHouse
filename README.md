# WelfareShare

Multi-tenant welfare distribution SaaS for Ghanaian tertiary halls and SRCs. Hall presidents upload a student list, send assistants into the field with unique join links, and watch collections live so the same student cannot collect twice.

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router v6
- **Backend:** Node.js, Express, MongoDB / Mongoose
- **Auth:** JWT access tokens + httpOnly refresh cookies
- **Payments:** Paystack initialize + `charge.success` webhook
- **Uploads:** Multer + SheetJS (`xlsx`)
- **Live desk:** Socket.IO activity feed

## Tenant model

Every hall/SRC is a tenant (`tenantId` slug, e.g. `atlantic-hall-knust`). Users, beneficiaries, distributions, collections, and invites are scoped to that id. MVP routing uses the path `/app` after login; the slug is stored on the tenant and shown in the desk (`/{tenant-slug}`).

## Roles

| Role | Can |
| --- | --- |
| Super admin | All tenants, revenue, expiry, activate/deactivate, Support Mode (view-only) |
| Tenant admin | Own hall only: distributions, Excel upload, assistant invites, live desk |
| Assistant | Join link only: search + mark received. No menu, reports, or settings |

Super admins **cannot** create distributions or mark beneficiaries, including in Support Mode.

## Six collections

1. **Tenant** — hall profile, plan (`hall` 500 / `src` 1500 GHS), `isActive`, `expiryDate`
2. **User** — `super_admin` / `tenant_admin` / `assistant`, refresh token hashes
3. **Distribution** — sharing event; only one `active` per tenant
4. **Beneficiary** — list row for a distribution (index, name, level, phone)
5. **Collection** — unique `(distributionId, beneficiaryId)` mark, with assistant + timestamp
6. **Invite** — `/join/ATL-89XK2` codes with hashed passwords; revoke disables the assistant

## Local setup

1. Install [MongoDB](https://www.mongodb.com/docs/manual/installation/) locally or use Atlas.
2. Copy env files:

```bash
cp backend/.env.example backend/.env
```

3. Put your Paystack test keys in `backend/.env`. Leave them as placeholders only if you will activate halls from the super-admin desk.
4. Install and run (two terminals):

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

Default super admin (from `.env`):

- Email: `samuel.w@example.com`
- Password: `ChangeMeNow1!`

Change both before any real deployment.

## Paystack webhook

Point Paystack to:

`POST https://<your-api-host>/api/payments/webhook`

Events used: `charge.success`. The signature header `x-paystack-signature` is verified with HMAC SHA512. The frontend callback at `/payment/callback` also verifies the reference as a backup.

## Excel columns

`Student Index`, `Full Name`, `Level`, `Phone` (header names are matched flexibly).

## Deploy

- **API:** Render or Railway — set env vars from `backend/.env.example`, start command `npm start`, health `/api/health`
- **Web:** Vercel or Netlify — build `npm run build`, output `dist`, set `VITE_API_URL` to the public API origin
- Frontend `vercel.json` rewrites all routes to `index.html`

Set `FRONTEND_URL` on the API to the deployed web origin, `COOKIE_SECURE=true`, and strong JWT secrets.
