-- ============================================================
-- Token rotation: an owner can regenerate a table's token (e.g. a printed QR
-- leaked or a tag was reused). The new token is server-generated (secure
-- random) — owners can rotate but never forge a specific token. The old QR /
-- NFC stops working immediately because its token no longer matches.
--
-- gen_random_bytes (pgcrypto) lives in the extensions schema; the function pins
-- search_path='' for safety, so it must be schema-qualified.
-- ============================================================
create or replace function public.rotate_table_token(p_table_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  -- Only a table belonging to a tenant the caller is a member of.
  update public.tables
     set token = encode(extensions.gen_random_bytes(24), 'hex')
   where id = p_table_id
     and tenant_id in (select public.current_tenant_ids())
  returning token into v_token;

  if v_token is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return v_token;
end;
$$;

revoke all on function public.rotate_table_token(uuid) from public, anon;
grant execute on function public.rotate_table_token(uuid) to authenticated;
