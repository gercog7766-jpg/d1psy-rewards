-- READ-ONLY preflight for active-prize uniqueness migration.
-- Run against a disposable clone of the target schema before applying any proposal.
-- Any rows returned by either query are blockers requiring manual investigation.
select prize_id, count(*) as active_rounds, array_agg(id order by started_at) as round_ids
from public.rewards_rounds
where status = 'active' and prize_id is not null
group by prize_id
having count(*) > 1;

select streamer_id, count(*) as active_rounds, array_agg(id order by started_at) as round_ids
from public.rewards_rounds
where status = 'active' and streamer_id is not null
group by streamer_id
having count(*) > 1;

-- Diagnostic: legacy rounds must retain NULL streamer_id until migrated explicitly.
select count(*) as active_legacy_rounds
from public.rewards_rounds
where status = 'active' and streamer_id is null;
