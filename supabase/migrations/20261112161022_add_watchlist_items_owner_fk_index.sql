-- Cover the composite watchlist ownership foreign key for deletes and joins.
create index if not exists watchlist_items_watchlist_owner_fk_idx
  on public.watchlist_items (watchlist_id, user_id);
