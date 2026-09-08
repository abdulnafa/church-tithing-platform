begin;

-- P14 replaces the legacy globally enumerable anonymous table projections with
-- two bounded, explicitly shaped read boundaries. The giving page never needs
-- donor, donation, progress, provider, subscription, legal, or support data.
create or replace function public.canonicalize_public_display_name(
  input_value text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      input_value,
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '',
      'g'
    ),
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
    ' ',
    'g'
  );
$$;

create or replace function public.canonicalize_public_multiline_text(
  input_value text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.replace(input_value, E'\r\n', E'\n'),
        E'\r',
        E'\n'
      ),
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '',
      'g'
    ),
    ''
  );
$$;

create type public.public_church_identity_record as (
  church_id uuid,
  display_name text,
  church_slug text
);

create type public.public_giving_fund_record as (
  fund_id uuid,
  name text,
  description text,
  is_default boolean
);

create type public.public_giving_campaign_record as (
  campaign_id uuid,
  fund_id uuid,
  name text,
  description text,
  goal_amount_minor_text text
);

create type public.public_giving_page_record as (
  church_id uuid,
  church_slug text,
  display_name text,
  default_currency text,
  logo_storage_path text,
  primary_color text,
  secondary_color text,
  thank_you_message text,
  funds public.public_giving_fund_record[],
  campaigns public.public_giving_campaign_record[]
);

-- Donor workspace resolution already possesses tenant UUIDs through the
-- authenticated donor relationship. This replacement lookup accepts at most
-- 50 unique, non-null UUIDs and never permits listing all active churches.
create or replace function public.get_public_church_identities(
  church_ids uuid[]
)
returns setof public.public_church_identity_record
language sql
stable
security definer
set search_path = ''
rows 50
as $$
  select row(
    church.id,
    public.canonicalize_public_display_name(church.name),
    church.slug
  )::public.public_church_identity_record
  from public.churches church
  where church_ids is not null
    and cardinality(church_ids) between 1 and 50
    and pg_catalog.array_position(church_ids, null) is null
    and cardinality(church_ids) = (
      select count(distinct requested_church_id)
      from pg_catalog.unnest(church_ids)
        as requested(requested_church_id)
    )
    and church.id = any(church_ids)
    and church.status = 'active'
    and char_length(
      public.canonicalize_public_display_name(church.name)
    ) between 2 and 120
    and church.name !~ '[[:cntrl:]]'
  order by church.id;
$$;

-- A successful result is one internally consistent statement snapshot. Invalid
-- input, an unavailable lifecycle state, unsafe public profile data, an invalid
-- default-fund foundation returns zero rows so
-- the public response cannot distinguish those cases from a missing slug.
create or replace function public.get_public_giving_page(
  church_slug text
)
returns setof public.public_giving_page_record
language sql
stable
security definer
set search_path = ''
rows 1
as $$
  select row(
    church.id,
    church.slug,
    public.canonicalize_public_display_name(church.name),
    church.default_currency,
    case
      when church.logo_storage_path ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
        and pg_catalog.split_part(church.logo_storage_path, '/', 1) =
          church.id::text
      then church.logo_storage_path
      else null
    end,
    case
      when church.primary_color ~ '^#[0-9A-Fa-f]{6}$'
      then pg_catalog.upper(church.primary_color)
      else null
    end,
    case
      when church.secondary_color ~ '^#[0-9A-Fa-f]{6}$'
      then pg_catalog.upper(church.secondary_color)
      else null
    end,
    case
      when church.thank_you_message is not null
        and char_length(
          public.canonicalize_public_multiline_text(
            church.thank_you_message
          )
        ) between 1 and 500
        and pg_catalog.regexp_replace(
          public.canonicalize_public_multiline_text(
            church.thank_you_message
          ),
          E'[\t\n]',
          '',
          'g'
        ) !~ '[[:cntrl:]]'
      then public.canonicalize_public_multiline_text(
        church.thank_you_message
      )
      else null
    end,
    coalesce(
      (
        select array_agg(
          row(
            fund.id,
            fund.name,
            fund.description,
            fund.is_default
          )::public.public_giving_fund_record
          order by fund.sort_order, pg_catalog.lower(fund.name), fund.id
        )
        from public.funds fund
        where fund.church_id = church.id
          and fund.status = 'active'
      ),
      array[]::public.public_giving_fund_record[]
    ),
    coalesce(
      (
        select array_agg(
          row(
            campaign.id,
            campaign.fund_id,
            campaign.name,
            campaign.description,
            campaign.goal_amount_minor::text
          )::public.public_giving_campaign_record
          order by
            campaign.starts_at desc nulls last,
            pg_catalog.lower(campaign.name),
            campaign.id
        )
        from public.campaigns campaign
        join public.funds campaign_fund
          on campaign_fund.church_id = campaign.church_id
         and campaign_fund.id = campaign.fund_id
         and campaign_fund.status = 'active'
        where campaign.church_id = church.id
          and campaign.status = 'active'
          and campaign.currency = church.default_currency
          and (
            campaign.starts_at is null
            or campaign.starts_at <= statement_timestamp()
          )
          and (
            campaign.ends_at is null
            or campaign.ends_at > statement_timestamp()
          )
      ),
      array[]::public.public_giving_campaign_record[]
    )
  )::public.public_giving_page_record
  from public.churches church
  where church_slug is not null
    and char_length(church_slug) between 2 and 63
    and church_slug = pg_catalog.lower(church_slug)
    and church_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and church.slug = church_slug
    and church.status = 'active'
    and char_length(
      public.canonicalize_public_display_name(church.name)
    ) between 2 and 120
    and church.name !~ '[[:cntrl:]]'
    and church.default_currency in ('BBD', 'USD', 'CAD', 'XCD')
    and (
      select count(*)
      from public.funds default_fund
      where default_fund.church_id = church.id
        and default_fund.status = 'active'
        and default_fund.is_default
    ) = 1;
$$;

comment on function public.get_public_church_identities(uuid[]) is
  'Returns only active public church identities for a bounded exact UUID set; it cannot enumerate tenants.';
comment on function public.get_public_giving_page(text) is
  'Returns one anonymous, slug-scoped, non-financial public giving configuration or zero rows when unavailable.';

-- These partial/covering indexes match the two public lookup paths. Current
-- time-window predicates remain query conditions because now() is not immutable
-- and therefore cannot be part of a PostgreSQL partial-index predicate.
create index churches_public_identity_idx
  on public.churches (id)
  include (slug)
  where status = 'active';

create index churches_public_giving_slug_idx
  on public.churches (slug)
  include (
    id,
    default_currency,
    logo_storage_path,
    primary_color,
    secondary_color
  )
  where status = 'active';

create index funds_public_giving_order_idx
  on public.funds (church_id, sort_order, id)
  include (name, is_default)
  where status = 'active';

create index campaigns_public_giving_order_idx
  on public.campaigns (
    church_id,
    starts_at desc,
    pg_catalog.lower(name),
    id
  )
  include (fund_id, goal_amount_minor, currency, ends_at)
  where status = 'active';

-- The RPCs now own public configuration disclosure. Removing both policies and
-- column grants prevents an accidental authenticated browser session or a raw
-- anonymous REST query from broadening this slug/ID-scoped public surface.
drop policy if exists churches_public_read_active on public.churches;
drop policy if exists funds_public_read_active on public.funds;
drop policy if exists campaigns_public_read_active on public.campaigns;
drop policy if exists qr_links_public_read_active on public.qr_links;

revoke select on table
  public.churches,
  public.funds,
  public.campaigns,
  public.qr_links
  from anon;
revoke select (id, name, slug, status)
  on public.churches from anon;
revoke select (
  id,
  church_id,
  name,
  slug,
  description,
  status,
  is_default,
  sort_order
) on public.funds from anon;
revoke select (
  id,
  church_id,
  fund_id,
  name,
  slug,
  description,
  image_url,
  status,
  goal_amount_minor,
  currency,
  starts_at,
  ends_at
) on public.campaigns from anon;
revoke select (
  church_id,
  kind,
  fund_id,
  campaign_id,
  short_code,
  is_active
) on public.qr_links from anon;

revoke all on type
  public.public_church_identity_record,
  public.public_giving_fund_record,
  public.public_giving_campaign_record,
  public.public_giving_page_record
  from public, anon, authenticated, service_role;
grant usage on type
  public.public_church_identity_record,
  public.public_giving_fund_record,
  public.public_giving_campaign_record,
  public.public_giving_page_record
  to anon;

revoke all on function
  public.canonicalize_public_display_name(text),
  public.canonicalize_public_multiline_text(text),
  public.get_public_church_identities(uuid[]),
  public.get_public_giving_page(text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.get_public_church_identities(uuid[]),
  public.get_public_giving_page(text)
  to anon;

commit;
