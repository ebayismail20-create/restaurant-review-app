-- ============================================================
-- Manager alert routing + transactional enqueue.
--
-- Adds manager contact fields to tenants, and extends submit_review to
-- INSERT a pending notifications row in the SAME transaction as the
-- submission for manager-facing kinds (alerted / private / anon-message).
-- If the feedback is saved, the alert is guaranteed queued — delivery can
-- never be silently skipped. Actual sending is done by the notify-manager
-- Edge Function (see supabase/functions/notify-manager).
--
-- submit_review's signature and uuid return are UNCHANGED — the enqueue is
-- additive and internal, so the API route and tests are unaffected.
-- ============================================================

alter table public.tenants
  add column if not exists manager_email text,
  add column if not exists manager_name  text;

comment on column public.tenants.manager_email is 'Where urgent/private guest feedback alerts are sent. Null = alerts still queue but cannot deliver.';

-- Demo seed (idempotent).
update public.tenants
set manager_email = 'ebay.ismail20@gmail.com', manager_name = 'Manager'
where slug = 'bistro-nordic';

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

  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.submissions
    where ip_hash = p_ip_hash
      and created_at > now() - interval '10 seconds';
    if v_recent >= 5 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

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

  if p_kind in ('alerted','private','anon-message') then
    insert into public.notifications (submission_id, channel, status)
    values (v_id, 'email', 'pending');
  end if;

  return v_id;
end;
$$;
