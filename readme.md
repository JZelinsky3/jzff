# jzff.online

Source repo for **jzff.online**.

## Structure

```
.
├── CNAME           — jzff.online domain pin
├── tsc/            — The Sunday Chronicle (Next.js app, deployed at root)
│   ├── src/          — App source
│   ├── public/
│   │   ├── demo/     — Static demo almanac (served at jzff.online/demo/)
│   │   └── old/      — Archived static site content (jzff.online/old/...)
│   └── ...
└── README.md
```

## Deploy

Vercel project must be configured with **Root Directory = `tsc`** so the
Next.js app builds from that subfolder. Environment variables required in
the Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TIER1_MONTHLY`
- `STRIPE_TIER1_YEARLY`
- `STRIPE_TIER2_MONTHLY`
- `STRIPE_TIER2_YEARLY`
- `STRIPE_TRIAL_DAYS`
- `LIFETIME_USER_IDS`

The weekly sync cron is defined in [tsc/vercel.json](tsc/vercel.json) and
fires Tuesdays at 22:00 UTC.

## Local dev

```bash
cd tsc
npm install
npm run dev
```
