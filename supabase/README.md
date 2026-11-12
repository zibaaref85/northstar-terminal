# Supabase schema and migration history

## Migration order

1. `migrations/20261111230000_northstar_foundation.sql` creates user profiles, watchlists, portfolio positions, price alerts, and row-level security policies.
2. `migrations/20261112000100_compliance_foundation.sql` adds policy consent, signup enforcement, entitlements, share snapshots, and Stripe event records. It leaves `legal_policy_config.approved` false.
3. `migrations/20261112161022_add_watchlist_items_owner_fk_index.sql` adds an index covering the composite watchlist ownership foreign key.

For a new Supabase project, apply the files in that order after reviewing them. They contain no provider keys or other secrets.

## Existing production project

The Northstar production project already has both schemas. The first two migrations were applied through the Supabase SQL Editor on November 11, 2026, before the standard migration ledger existed. On November 12, 2026, the composite foreign-key index was added through the Supabase migration tool and recorded as version `20261112161022`. The first two migrations are still absent from the ledger. Use the official `supabase migration repair` workflow to mark those versions applied only after verifying their schemas; do not replay those SQL files or run `supabase db push` against production before reconciling history.

Account registration remains paused until counsel approves the actual Terms and Privacy policies, the database policy row and Vercel policy versions are synchronized, and the server-only Supabase secret is configured. The service key bypasses row-level security; keep it only in server-side Vercel environment variables.

The browser uses only the Supabase URL and publishable key. Paid entitlements may be changed only by the verified Stripe webhook. Public sharing stays disabled until legal, market-data, and separate sharing-content rights are confirmed.

See the root `README.md` and `.env.example` for local setup and environment variable names. Vercel excludes SQL files and this directory from the public deployment through `.vercelignore`; they remain available in source control for maintainers.
