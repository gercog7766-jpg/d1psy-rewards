-- Apply only after the atomic OAuth callback has been deployed and verified.
UPDATE public.rewards_referral_registration_policy SET enforce_first_registration=true WHERE id=true;
