-- Claim a pending invite only once the invited person *accepts* (their email
-- becomes confirmed), not the instant the account is created by the invite.
-- This keeps an invited teammate in "Pending invites" until they actually set
-- a password — what owners expect, matching how Slack/Notion/Linear behave.
-- (Refines the AFTER INSERT trigger added in 0016_team_management.)
drop trigger if exists on_auth_user_created_claim_invites on auth.users;
create trigger on_auth_user_confirmed_claim_invites
  after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.claim_team_invites();
