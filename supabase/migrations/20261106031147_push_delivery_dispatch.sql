-- Web Push is dispatched independently of the Render web service lifecycle.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create function rewards_private.wake_drop_push() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text;
begin
 if not exists(select 1 from public.rewards_push_jobs where created_at>now()-interval '24 hours' and attempts<6 and ((status='queued' and next_attempt_at<=now()) or(status='sending' and lease_until<now()))) then return; end if;
 select c.dispatch_url,v.decrypted_secret into endpoint,secret from public.rewards_push_config c join vault.decrypted_secrets v on v.id=c.dispatch_secret_id where c.id=true;
 if endpoint is not null and secret is not null then
  perform net.http_post(url:=endpoint,body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-push-dispatch-key',secret),timeout_milliseconds:=10000);
 end if;
exception when others then
 -- Delivery failures must never roll back a user's won item. The cron retries.
 raise warning 'push_wakeup_failed';
end $$;
revoke all on function rewards_private.wake_drop_push() from public,anon,authenticated;

create function rewards_private.wake_drop_push_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform rewards_private.wake_drop_push(); return new; end $$;
revoke all on function rewards_private.wake_drop_push_trigger() from public,anon,authenticated;
create trigger rewards_push_wakeup after insert on public.rewards_push_jobs for each statement execute function rewards_private.wake_drop_push_trigger();

select cron.schedule('d1psy-drop-push-retry','* * * * *',$cron$select rewards_private.wake_drop_push();$cron$);
select cron.schedule('d1psy-pwa-cleanup','17 3 * * *',$cron$
 delete from public.rewards_device_sessions where expires_at<now() or hard_expires_at<now();
 delete from public.rewards_push_jobs where created_at<now()-interval '7 days';
 delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname in('d1psy-drop-push-retry','d1psy-pwa-cleanup')) and end_time<now()-interval '7 days';
$cron$);
