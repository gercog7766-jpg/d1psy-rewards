insert into public.rewards_predict_matches(id,tournament,starts_at,team_a,team_b,logo_a,logo_b,roster_a,roster_b,best_of,score_reward)
select '2026-11-08-mongolz-mouz','IEM Beijing','2026-11-08T07:30:00Z','The MongolZ','MOUZ',a.logo_a,b.logo_b,a.roster_a,b.roster_b,5,5
from public.rewards_predict_matches a cross join public.rewards_predict_matches b
where a.id='2026-11-07-mongolz-navi' and b.id='2026-11-07-betboom-mouz'
on conflict(id) do nothing;
