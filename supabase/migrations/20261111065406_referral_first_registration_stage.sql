-- Applied to production before the OAuth deployment. Strict mode is enabled
-- only after the new callback has been installed and verified.
LOCK TABLE public.rewards_users IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.rewards_registration_identities (
 twitch_user_id text PRIMARY KEY,
 first_user_id uuid NOT NULL,
 first_seen_at timestamptz NOT NULL,
 registration_xid bigint NOT NULL
);
INSERT INTO public.rewards_registration_identities(twitch_user_id,first_user_id,first_seen_at,registration_xid)
SELECT twitch_user_id,id,created_at,0 FROM public.rewards_users;
CREATE TABLE public.rewards_referral_registration_permits (
 user_id uuid PRIMARY KEY REFERENCES public.rewards_users(id) ON DELETE CASCADE,
 registration_xid bigint NOT NULL
);
CREATE TABLE public.rewards_referral_registration_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enforce_first_registration boolean NOT NULL
);
INSERT INTO public.rewards_referral_registration_policy VALUES(true,false);
CREATE TABLE public.rewards_referral_detachments (
 referred_user_id uuid PRIMARY KEY REFERENCES public.rewards_users(id),
 referrer_user_id uuid NOT NULL REFERENCES public.rewards_users(id),
 detached_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL,
 snapshot jsonb NOT NULL
);
ALTER TABLE public.rewards_registration_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_referral_registration_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_referral_registration_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards_referral_detachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rewards_registration_identities,public.rewards_referral_registration_permits,public.rewards_referral_registration_policy,public.rewards_referral_detachments FROM public,anon,authenticated;
GRANT SELECT,INSERT ON public.rewards_registration_identities,public.rewards_referral_detachments TO service_role;
GRANT SELECT,INSERT,DELETE ON public.rewards_referral_registration_permits TO service_role;
GRANT SELECT ON public.rewards_referral_registration_policy TO service_role;
GRANT DELETE ON public.rewards_referrals TO service_role;
ALTER TABLE public.rewards_referral_events DROP CONSTRAINT rewards_referral_events_referred_user_id_fkey;
ALTER TABLE public.rewards_referral_events ADD CONSTRAINT rewards_referral_events_referred_history_fkey FOREIGN KEY(referred_user_id) REFERENCES public.rewards_users(id);
CREATE FUNCTION public.rewards_track_registration_identity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO public.rewards_registration_identities(twitch_user_id,first_user_id,first_seen_at,registration_xid)
 VALUES(new.twitch_user_id,new.id,new.created_at,pg_catalog.txid_current()) ON CONFLICT(twitch_user_id) DO NOTHING;
 RETURN new;
END $$;
CREATE TRIGGER rewards_track_registration_identity AFTER INSERT ON public.rewards_users FOR EACH ROW EXECUTE FUNCTION public.rewards_track_registration_identity();
CREATE FUNCTION public.rewards_guard_referral_registration() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF tg_op='UPDATE' THEN
  IF new.referred_user_id IS NOT DISTINCT FROM old.referred_user_id AND new.referrer_user_id IS NOT DISTINCT FROM old.referrer_user_id THEN RETURN new; END IF;
  RAISE EXCEPTION 'referral_identity_immutable';
 END IF;
 IF EXISTS(SELECT 1 FROM public.rewards_referral_detachments WHERE referred_user_id=new.referred_user_id) THEN RAISE EXCEPTION 'existing_user'; END IF;
 IF (SELECT enforce_first_registration FROM public.rewards_referral_registration_policy WHERE id) AND NOT EXISTS(
  SELECT 1 FROM public.rewards_referral_registration_permits p
  JOIN public.rewards_users u ON u.id=p.user_id
  JOIN public.rewards_registration_identities i ON i.twitch_user_id=u.twitch_user_id
  WHERE p.user_id=new.referred_user_id AND p.registration_xid=pg_catalog.txid_current()
    AND i.registration_xid=p.registration_xid AND i.first_user_id=p.user_id
 ) THEN RAISE EXCEPTION 'existing_user'; END IF;
 RETURN new;
END $$;
CREATE TRIGGER rewards_guard_referral_registration BEFORE INSERT OR UPDATE ON public.rewards_referrals FOR EACH ROW EXECUTE FUNCTION public.rewards_guard_referral_registration();
ALTER FUNCTION public.rewards_referral_bind(uuid,text) RENAME TO rewards_referral_bind_legacy;
CREATE FUNCTION public.rewards_referral_bind(p_user uuid,p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.rewards_users WHERE id=p_user AND NOT banned) THEN RAISE EXCEPTION 'user_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.rewards_referrals WHERE referred_user_id=p_user) THEN RETURN jsonb_build_object('ok',true,'status','already_bound'); END IF;
 IF EXISTS(SELECT 1 FROM public.rewards_referral_detachments WHERE referred_user_id=p_user) THEN RETURN jsonb_build_object('ok',false,'status','existing_user'); END IF;
 IF (SELECT enforce_first_registration FROM public.rewards_referral_registration_policy WHERE id) AND NOT EXISTS(
  SELECT 1 FROM public.rewards_referral_registration_permits p
  JOIN public.rewards_users u ON u.id=p.user_id
  JOIN public.rewards_registration_identities i ON i.twitch_user_id=u.twitch_user_id
  WHERE p.user_id=p_user AND p.registration_xid=pg_catalog.txid_current()
    AND i.registration_xid=p.registration_xid AND i.first_user_id=p_user
 ) THEN RETURN jsonb_build_object('ok',false,'status','existing_user'); END IF;
 RETURN public.rewards_referral_bind_legacy(p_user,p_code);
END $$;
CREATE FUNCTION public.rewards_register_twitch_identity(p_twitch_id text,p_login text,p_display_name text,p_avatar_url text DEFAULT NULL,p_referral_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid uuid; inserted boolean; first_ever boolean:=false; binding jsonb;
BEGIN
 IF p_twitch_id IS NULL OR p_twitch_id !~ '^[0-9]{1,30}$' OR p_login IS NULL OR p_login !~ '^[a-z0-9_]{1,25}$'
  OR p_display_name IS NULL OR char_length(p_display_name) NOT BETWEEN 1 AND 100
  OR (p_avatar_url IS NOT NULL AND p_avatar_url !~ '^https://static-cdn\.jtvnw\.net/')
 THEN RAISE EXCEPTION 'invalid_twitch_identity'; END IF;
 INSERT INTO public.rewards_users(twitch_user_id,twitch_login,twitch_display_name,twitch_avatar_url)
 VALUES(p_twitch_id,p_login,p_display_name,p_avatar_url)
 ON CONFLICT(twitch_user_id) DO NOTHING RETURNING id INTO uid;
 inserted:=found;
 IF NOT inserted THEN
  UPDATE public.rewards_users SET twitch_login=p_login,twitch_display_name=p_display_name,
   twitch_avatar_url=coalesce(p_avatar_url,twitch_avatar_url),updated_at=now()
  WHERE twitch_user_id=p_twitch_id RETURNING id INTO uid;
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.rewards_registration_identities
   WHERE twitch_user_id=p_twitch_id AND first_user_id=uid AND registration_xid=pg_catalog.txid_current()) INTO first_ever;
 END IF;
 IF uid IS NULL THEN RAISE EXCEPTION 'registration_failed'; END IF;
 IF first_ever AND p_referral_code ~ '^[a-f0-9]{24}$' THEN
  INSERT INTO public.rewards_referral_registration_permits VALUES(uid,pg_catalog.txid_current());
  binding:=public.rewards_referral_bind(uid,p_referral_code);
  DELETE FROM public.rewards_referral_registration_permits WHERE user_id=uid;
 END IF;
 RETURN jsonb_build_object('userId',uid,'isNew',first_ever,'referralStatus',
  coalesce(binding->>'status',CASE WHEN first_ever THEN 'no_invitation' ELSE 'existing_user' END));
END $$;
REVOKE ALL ON FUNCTION public.rewards_track_registration_identity(),public.rewards_guard_referral_registration(),
 public.rewards_referral_bind(uuid,text),public.rewards_register_twitch_identity(text,text,text,text,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rewards_track_registration_identity(),public.rewards_guard_referral_registration(),
 public.rewards_referral_bind(uuid,text),public.rewards_register_twitch_identity(text,text,text,text,text)
 TO service_role;
