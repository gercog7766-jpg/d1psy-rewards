alter table public.rewards_skin_battle_entries drop constraint if exists rewards_skin_battle_entries_source_win_id_key;
create unique index if not exists rewards_skin_battle_entries_reserved_win_idx on public.rewards_skin_battle_entries(source_win_id) where status='reserved';
