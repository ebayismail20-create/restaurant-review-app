-- ============================================================
-- submit_review: the ONE write path into submissions.
--
-- SECURITY DEFINER so it can insert past the deny-all RLS, but it is the
-- only thing granted to the anon role — the public key can call this and
-- nothing else. Everything security-relevant is decided HERE, server-side:
--   * the table token must match an active table (physical-presence proof)
--   * tenant_id / table_id come from the looked-up rows, never the caller
--   * priority is derived from kind, never trusted from the caller
--   * created_at is the DB clock
--   * a short ip_hash rate-limit window blunts scripted spam
-- search_path is pinned empty + every object fully qualified, so a hostile
-- search_path can't shadow our tables/functions.
-- ============================================================
create or replace function public.submit_review(
  p_slug        text,
  p_table_label text,
  p_token       text,
  p_kind        text,
  p_rating      int,
  p_tag_keys    text[],
  p_message     text,
  p_language    text,
  p_session_id  uuid,
  p_ip_hash     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_table_id  uuid;
  v_priority  text;
  v_recent    int;
  v_id        uuid;
begin
  select id into v_tenant_id from public.tenants where slug = p_slug;
  if v_tenant_id is null then
    raise exception 'invalid_venue' using errcode = 'P0001';
  end if;

  -- Resolve table + verify token. One generic error so we never reveal
  -- whether it was the label or the token that was wrong.
  select id into v_table_id
  from public.tables
  where tenant_id = v_tenant_id
    and label = p_table_label
    and token = p_token
    and active = true;
  if v_table_id is null then
    raise exception 'invalid_table_token' using errcode = 'P0001';
  end if;

  if p_kind not in ('posted','private','alerted','rated','anon-message') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if p_language not in ('en','fi','sv') then
    raise exception 'invalid_language' using errcode = 'P0001';
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;

  -- Coarse rate limit: max 5 submissions per ip_hash per 10s window.
  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.submissions
    where ip_hash = p_ip_hash
      and created_at > now() - interval '10 seconds';
    if v_recent >= 5 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  -- Authoritative priority — caller's opinion is ignored.
  v_priority := case
    when p_kind in ('alerted','anon-message') then 'urgent'
    when p_kind = 'private' then 'normal'
    else 'info'
  end;

  insert into public.submissions (
    tenant_id, table_id, kind, rating, tag_keys, message,
    language, session_id, priority, ip_hash
  ) values (
    v_tenant_id, v_table_id, p_kind, p_rating,
    coalesce(p_tag_keys, '{}'), left(coalesce(p_message, ''), 600),
    p_language, p_session_id, v_priority, p_ip_hash
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_review(
  text, text, text, text, int, text[], text, text, uuid, text
) from public;
grant execute on function public.submit_review(
  text, text, text, text, int, text[], text, text, uuid, text
) to anon, authenticated;
