begin;

-- Printed QR artwork contains only a high-entropy, immutable short code. This
-- anonymous boundary resolves one exact code to the church's current internal
-- slug; it never accepts or returns a host, URL, tenant UUID, or display data.
-- All malformed, inactive, and unavailable cases deliberately return no row.
create or replace function public.resolve_public_qr(
  target_short_code text
)
returns table (
  church_slug text
)
language sql
stable
security definer
set search_path = ''
rows 1
as $$
  select church.slug as church_slug
  from public.qr_links qr_link
  join public.churches church
    on church.id = qr_link.church_id
  where target_short_code is not null
    and pg_catalog.char_length(target_short_code) between 8 and 64
    and target_short_code = pg_catalog.lower(target_short_code)
    and target_short_code ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
    and pg_catalog.lower(qr_link.short_code) = target_short_code
    and qr_link.short_code = target_short_code
    and qr_link.kind = 'church'
    and qr_link.fund_id is null
    and qr_link.campaign_id is null
    and qr_link.is_active
    and church.status = 'active'
    and pg_catalog.char_length(church.slug) between 2 and 63
    and church.slug = pg_catalog.lower(church.slug)
    and church.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  limit 1;
$$;

comment on function public.resolve_public_qr(text) is
  'Resolves one exact active permanent QR code to its active church current canonical slug; every unavailable business case returns zero rows.';

-- The authenticated dashboard does not read qr_links directly. It receives the
-- minimum printable snapshot only after a fresh named-permission check. Missing
-- and foreign targets share the same permission error, so this cannot probe
-- tenant existence. An inactive QR row is returned as explicit status so staff
-- do not print an unavailable code.
create or replace function public.get_church_qr_snapshot(
  target_church_id uuid
)
returns table (
  church_id uuid,
  church_slug text,
  short_code text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
rows 1
as $$
begin
  if target_church_id is null
    or not public.has_church_permission(target_church_id, 'qr_read') then
    raise exception 'QR_SNAPSHOT_FORBIDDEN'
      using errcode = '42501';
  end if;

  return query
  select
    qr_link.church_id,
    church.slug,
    qr_link.short_code,
    qr_link.is_active
  from public.qr_links qr_link
  join public.churches church
    on church.id = qr_link.church_id
  where qr_link.church_id = target_church_id
    and qr_link.kind = 'church'
    and qr_link.fund_id is null
    and qr_link.campaign_id is null
    and pg_catalog.char_length(qr_link.short_code) between 8 and 64
    and qr_link.short_code = pg_catalog.lower(qr_link.short_code)
    and qr_link.short_code ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
    and pg_catalog.char_length(church.slug) between 2 and 63
    and church.slug = pg_catalog.lower(church.slug)
    and church.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  limit 1;
end;
$$;

comment on function public.get_church_qr_snapshot(uuid) is
  'Returns the permission-checked minimum permanent QR snapshot for one active or onboarding church workspace.';

-- Direct browser-table access is retired in favor of the two purpose-specific
-- RPC projections. The service role keeps its existing operational SELECT and
-- update-only access for availability and aggregate scan analytics.
drop policy if exists qr_links_permission_read on public.qr_links;
revoke select on table public.qr_links
  from public, anon, authenticated;

revoke all on function
  public.resolve_public_qr(text),
  public.get_church_qr_snapshot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_public_qr(text)
  to anon;
grant execute on function public.get_church_qr_snapshot(uuid)
  to authenticated;

commit;
