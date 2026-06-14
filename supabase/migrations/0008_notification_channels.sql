-- ============================================================
-- Owner-configurable notification channels.
--
-- Replaces the single tenants.manager_email with a list of destinations the
-- owner manages in the dashboard: any mix of email / SMS / WhatsApp numbers.
-- "Alert the whole team" = add several recipients (the WhatsApp Business API
-- cannot post to a group chat, so multiple numbers is the supported model).
--
-- Delivery is per-channel in the notify-manager Edge Function; the guest path
-- is unchanged. submit_review enqueues one pending notification per enabled
-- channel, transactionally, so alerts can't be lost.
-- ============================================================

create table public.tenant_notification_channels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  kind        text not null check (kind in ('email','sms','whatsapp')),
  destination text not null,          -- email address, or E.164 phone (+358...)
  label       text,                   -- optional, e.g. "Manager", "Floor lead"
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index tenant_notification_channels_tenant_idx
  on public.tenant_notification_channels (tenant_id);
alter table public.tenant_notification_channels enable row level security;

create policy channels_select on public.tenant_notification_channels
  for select to authenticated using (tenant_id in (select public.current_tenant_ids()));
create policy channels_insert on public.tenant_notification_channels
  for insert to authenticated with check (tenant_id in (select public.current_tenant_ids()));
create policy channels_update on public.tenant_notification_channels
  for update to authenticated using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));
create policy channels_delete on public.tenant_notification_channels
  for delete to authenticated using (tenant_id in (select public.current_tenant_ids()));

-- notifications: allow 'whatsapp', record the destination.
alter table public.notifications drop constraint if exists notifications_channel_check;
alter table public.notifications
  add constraint notifications_channel_check
  check (channel in ('email','sms','whatsapp','push','webhook'));
alter table public.notifications add column if not exists destination text;

-- Migrate any existing manager_email into a channel.
insert into public.tenant_notification_channels (tenant_id, kind, destination, label)
select id, 'email', manager_email, coalesce(manager_name, 'Manager')
from public.tenants
where manager_email is not null
  and not exists (
    select 1 from public.tenant_notification_channels c
    where c.tenant_id = tenants.id and c.kind = 'email' and c.destination = tenants.manager_email
  );

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
  where tenant_id = v_tenant_id and label = p_table_label
    and token = p_token and active = true;
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
    where ip_hash = p_ip_hash and created_at > now() - interval '10 seconds';
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

  -- One pending alert per enabled channel, for manager-facing kinds.
  if p_kind in ('alerted','private','anon-message') then
    insert into public.notifications (submission_id, channel, destination, status)
    select v_id, c.kind, c.destination, 'pending'
    from public.tenant_notification_channels c
    where c.tenant_id = v_tenant_id and c.enabled;
  end if;

  return v_id;
end;
$$;
