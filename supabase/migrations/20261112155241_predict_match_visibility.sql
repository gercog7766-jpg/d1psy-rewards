alter table public.rewards_predict_matches
  add column hidden_at timestamptz,
  add constraint rewards_predict_matches_hidden_after_settlement
    check (hidden_at is null or status = 'settled');
