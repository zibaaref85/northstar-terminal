# Northstar Market Intelligence

A static dashboard with Vercel serverless API routes for market data, SEC filings, Supabase account tools, and Stripe scaffolding.

## Local preview

Use Node.js 24 and the Vercel CLI:

```sh
npm install
npx vercel dev
```

Open the local address printed by Vercel. Without provider settings, the dashboard stays in sample-data mode.

For a local setup, copy `.env.example` to `.env.local` and fill only the values needed for the feature you are working on. The example intentionally keeps account, market-data, billing, and sharing release gates closed. Never commit `.env.local` or copy real secrets into `.env.example`.

## Production safety gates

Northstar is a demo until its legal and commercial prerequisites are complete. Never add secrets to source control or browser code.

- Market data remains blocked until a written public-display license is in place and `FINNHUB_API_KEY`, `MARKET_DATA_DISPLAY_RIGHTS_CONFIRMED=true`, and `MARKET_DATA_LICENSE_ID` are configured as server-side Vercel environment variables.
- Account creation remains paused until counsel-approved policy versions, the compliance migration, and server-only Supabase credentials are configured.
- Billing and account deletion remain unavailable until their separate settings and reviews are complete. Sharing additionally requires an explicit sharing release flag, approved legal policy versions, a market-data display license, a separate sharing-content permission record, and the server-only Supabase secret key; the API checks this gate directly on reads, creation, and revocation.
- SEC filings remain unavailable until a monitored SEC User-Agent contact is configured.
- Current prices and news are illustrative sample data, not live information or investment advice.

The legal pages in `legal/` are drafts and need qualified counsel review before use as customer policies.

## Database schema

The timestamped migration history and its setup notes are in `supabase/`. The production project already has these schemas applied, but its migration ledger was not initialized; reconcile production history before using the Supabase CLI. `.vercelignore` keeps SQL setup files out of the public website while preserving them in the source tree.

## Repository contents

This source tree contains the runnable site and public-facing policy pages. Private launch notes, account-specific Vercel/Supabase links, local credentials, and `.vercel` project metadata are intentionally excluded.
