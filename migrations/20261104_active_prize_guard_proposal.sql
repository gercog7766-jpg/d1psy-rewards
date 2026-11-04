-- PROPOSAL ONLY. Do not apply to production before isolated concurrency tests.
-- Prevent assigning the same prize to two simultaneously active rounds.
create unique index if not exists rewards_rounds_active_prize_unique_idx
  on public.rewards_rounds (prize_id)
  where status = 'active' and prize_id is not null;
