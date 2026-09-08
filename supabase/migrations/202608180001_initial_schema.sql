-- Church Digital Tithing Platform
-- Initial multi-tenant schema for Supabase/PostgreSQL.
--
-- Money is stored in minor units (for example, 1099 = USD 10.99).
-- Payment-provider secrets, full card data, bank details, and raw webhook payloads
-- must never be stored in these public-schema tables.

begin;

-- -----------------------------------------------------------------------------
-- Domain enums
-- -----------------------------------------------------------------------------

create type public.church_status as enum (
  'onboarding',
  'active',
  'suspended',
  'canceled',
  'archived'
);

create type public.platform_admin_role as enum ('super_admin', 'support');
create type public.church_member_role as enum ('owner', 'finance_admin', 'staff', 'accountant');
create type public.membership_status as enum ('invited', 'active', 'suspended', 'revoked');
create type public.fund_status as enum ('active', 'archived');
create type public.campaign_status as enum ('draft', 'active', 'closed', 'archived');
create type public.provider_connection_status as enum ('pending', 'active', 'restricted', 'disabled');
create type public.donation_source as enum ('online', 'cash', 'cheque', 'other');
create type public.donation_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'partially_refunded',
  'refunded',
  'disputed',
  'canceled'
);
create type public.recurring_frequency as enum ('weekly', 'monthly');
create type public.recurring_gift_status as enum (
  'incomplete',
  'active',
  'paused',
  'past_due',
  'canceled'
);
create type public.provider_object_type as enum (
  'customer',
  'payment_method',
  'payment',
  'checkout_session',
  'subscription',
  'invoice',
  'refund',
  'dispute',
  'payout'
);
create type public.receipt_status as enum ('draft', 'issued', 'voided');
create type public.statement_status as enum ('draft', 'published', 'superseded', 'voided');
create type public.platform_subscription_status as enum (
  'incomplete',
  'active',
  'past_due',
  'unpaid',
  'paused',
  'canceled'
);
create type public.webhook_processing_status as enum (
  'received',
  'processing',
  'processed',
  'failed',
  'ignored'
);
create type public.email_delivery_status as enum (
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'suppressed'
);
create type public.qr_link_kind as enum ('church', 'fund', 'campaign');
create type public.audit_actor_type as enum ('user', 'system', 'webhook', 'support');

-- -----------------------------------------------------------------------------
-- Shared trigger helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_church_id_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.church_id is distinct from old.church_id then
    raise exception 'church_id cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_qr_routing_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.church_id is distinct from old.church_id
    or new.kind is distinct from old.kind
    or new.fund_id is distinct from old.fund_id
    or new.campaign_id is distinct from old.campaign_id
    or new.short_code is distinct from old.short_code then
    raise exception 'permanent QR routing fields cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.protect_webhook_routing()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.church_id is not null and new.church_id is distinct from old.church_id then
    raise exception 'resolved webhook church_id cannot be changed';
  end if;
  if old.connection_id is not null and new.connection_id is distinct from old.connection_id then
    raise exception 'resolved webhook connection_id cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_donation_snapshot_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.church_id is distinct from old.church_id
    or new.donor_id is distinct from old.donor_id
    or new.fund_id is distinct from old.fund_id
    or new.campaign_id is distinct from old.campaign_id
    or new.recurring_gift_id is distinct from old.recurring_gift_id
    or new.payment_connection_id is distinct from old.payment_connection_id
    or new.source is distinct from old.source
    or new.amount_minor is distinct from old.amount_minor
    or new.currency is distinct from old.currency
    or new.donor_display_name is distinct from old.donor_display_name
    or new.donor_email is distinct from old.donor_email
    or new.donor_message is distinct from old.donor_message
    or new.external_idempotency_key is distinct from old.external_idempotency_key
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'donation identity and giving snapshot cannot be changed';
  end if;

  if old.provider_payment_reference is not null
    and new.provider_payment_reference is distinct from old.provider_payment_reference then
    raise exception 'donation provider payment reference cannot be changed once set';
  end if;

  if old.provider_charge_reference is not null
    and new.provider_charge_reference is distinct from old.provider_charge_reference then
    raise exception 'donation provider charge reference cannot be changed once set';
  end if;

  if old.donated_at is not null and new.donated_at is distinct from old.donated_at then
    raise exception 'donation collection timestamp cannot be changed once set';
  end if;

  return new;
end;
$$;

create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity, tenancy, and access
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (email is null or btrim(email) <> '')
);

create unique index profiles_email_unique_idx
  on public.profiles (lower(btrim(email)))
  where email is not null;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.platform_admin_role not null default 'support',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_admins_created_by_fk_idx
  on public.platform_admins (created_by)
  where created_by is not null;

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text not null,
  status public.church_status not null default 'onboarding',
  default_currency text not null default 'USD',
  timezone text not null default 'America/Barbados',
  logo_url text,
  primary_color text,
  secondary_color text,
  thank_you_message text,
  support_email text,
  public_settings jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  suspended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint churches_name_not_blank check (btrim(name) <> ''),
  constraint churches_slug_format check (
    char_length(slug) between 2 and 63
    and lower(slug) = slug
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint churches_currency_format check (default_currency ~ '^[A-Z]{3}$'),
  constraint churches_primary_color_format check (
    primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint churches_secondary_color_format check (
    secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint churches_public_settings_object check (jsonb_typeof(public_settings) = 'object')
);

create unique index churches_slug_unique_idx on public.churches (lower(slug));
create index churches_status_idx on public.churches (status);
create index churches_created_by_fk_idx on public.churches (created_by)
  where created_by is not null;

create table public.church_memberships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role public.church_member_role not null,
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_memberships_tenant_key unique (church_id, id),
  constraint church_memberships_identity_present check (
    user_id is not null or (invited_email is not null and btrim(invited_email) <> '')
  ),
  constraint church_memberships_active_has_user check (
    status <> 'active' or user_id is not null
  )
);

create unique index church_memberships_user_unique_idx
  on public.church_memberships (church_id, user_id)
  where user_id is not null;
create unique index church_memberships_pending_email_unique_idx
  on public.church_memberships (church_id, lower(btrim(invited_email)))
  where user_id is null and status = 'invited';
create index church_memberships_user_status_idx
  on public.church_memberships (user_id, status)
  where user_id is not null;
create index church_memberships_church_role_idx
  on public.church_memberships (church_id, role, status);
create index church_memberships_invited_by_fk_idx
  on public.church_memberships (invited_by)
  where invited_by is not null;

-- -----------------------------------------------------------------------------
-- Giving configuration
-- -----------------------------------------------------------------------------

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status public.fund_status not null default 'active',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funds_tenant_key unique (church_id, id),
  constraint funds_name_not_blank check (btrim(name) <> ''),
  constraint funds_slug_format check (
    char_length(slug) between 1 and 80
    and lower(slug) = slug
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint funds_default_must_be_active check (not is_default or status = 'active')
);

create unique index funds_slug_unique_idx on public.funds (church_id, lower(slug));
create unique index funds_one_default_idx
  on public.funds (church_id)
  where is_default and status = 'active';
create index funds_active_sort_idx on public.funds (church_id, sort_order, name)
  where status = 'active';
create index funds_created_by_fk_idx on public.funds (created_by)
  where created_by is not null;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  fund_id uuid,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  status public.campaign_status not null default 'draft',
  goal_amount_minor bigint,
  currency text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_tenant_key unique (church_id, id),
  constraint campaigns_fund_tenant_fk foreign key (church_id, fund_id)
    references public.funds(church_id, id) on delete restrict,
  constraint campaigns_name_not_blank check (btrim(name) <> ''),
  constraint campaigns_slug_format check (
    char_length(slug) between 1 and 80
    and lower(slug) = slug
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint campaigns_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint campaigns_goal_positive check (goal_amount_minor is null or goal_amount_minor > 0),
  constraint campaigns_dates_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index campaigns_slug_unique_idx on public.campaigns (church_id, lower(slug));
create index campaigns_public_idx on public.campaigns (church_id, status, starts_at, ends_at);
create index campaigns_fund_idx on public.campaigns (church_id, fund_id);
create index campaigns_created_by_fk_idx on public.campaigns (created_by)
  where created_by is not null;

-- -----------------------------------------------------------------------------
-- Donors and payment-provider connections
-- -----------------------------------------------------------------------------

create table public.donors (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text,
  email text,
  phone text,
  is_anonymous boolean not null default false,
  last_gave_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donors_tenant_key unique (church_id, id),
  constraint donors_email_not_blank check (email is null or btrim(email) <> '')
);

create unique index donors_auth_user_unique_idx
  on public.donors (church_id, auth_user_id)
  where auth_user_id is not null;
create unique index donors_email_unique_idx
  on public.donors (church_id, lower(btrim(email)))
  where email is not null;
create index donors_last_gave_idx on public.donors (church_id, last_gave_at desc);
create index donors_auth_user_fk_idx on public.donors (auth_user_id)
  where auth_user_id is not null;

create table public.payment_provider_connections (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  provider text not null,
  external_account_reference text not null,
  status public.provider_connection_status not null default 'pending',
  is_primary boolean not null default false,
  charges_enabled boolean not null default false,
  recurring_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  supported_currencies text[] not null default '{}'::text[],
  capabilities jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_connections_tenant_key unique (church_id, id),
  constraint payment_provider_connections_provider_not_blank check (btrim(provider) <> ''),
  constraint payment_provider_connections_account_not_blank check (btrim(external_account_reference) <> ''),
  constraint payment_provider_connections_capabilities_object check (jsonb_typeof(capabilities) = 'object')
);

create unique index payment_provider_connections_external_unique_idx
  on public.payment_provider_connections (lower(provider), external_account_reference);
create unique index payment_provider_connections_one_primary_idx
  on public.payment_provider_connections (church_id)
  where is_primary;
create index payment_provider_connections_status_idx
  on public.payment_provider_connections (church_id, status);
create index payment_provider_connections_created_by_fk_idx
  on public.payment_provider_connections (created_by)
  where created_by is not null;

comment on table public.payment_provider_connections is
  'Provider account identifiers and capabilities only. Never store API secrets or bank credentials here.';

-- -----------------------------------------------------------------------------
-- Recurring gifts and donation ledger
-- -----------------------------------------------------------------------------

create table public.recurring_gifts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  donor_id uuid not null,
  fund_id uuid not null,
  campaign_id uuid,
  payment_connection_id uuid not null,
  amount_minor bigint not null,
  currency text not null,
  frequency public.recurring_frequency not null,
  status public.recurring_gift_status not null default 'incomplete',
  provider_subscription_reference text,
  provider_payment_method_reference text,
  payment_method_brand text,
  payment_method_last4 text,
  started_at timestamptz,
  next_charge_at timestamptz,
  paused_at timestamptz,
  resume_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_gifts_tenant_key unique (church_id, id),
  constraint recurring_gifts_tenant_identity_key
    unique (church_id, id, donor_id, payment_connection_id),
  constraint recurring_gifts_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint recurring_gifts_fund_tenant_fk foreign key (church_id, fund_id)
    references public.funds(church_id, id) on delete restrict,
  constraint recurring_gifts_campaign_tenant_fk foreign key (church_id, campaign_id)
    references public.campaigns(church_id, id) on delete restrict,
  constraint recurring_gifts_connection_tenant_fk foreign key (church_id, payment_connection_id)
    references public.payment_provider_connections(church_id, id) on delete restrict,
  constraint recurring_gifts_amount_positive check (amount_minor > 0),
  constraint recurring_gifts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint recurring_gifts_last4_format check (
    payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'
  ),
  constraint recurring_gifts_pause_dates_valid check (
    resume_at is null or paused_at is null or resume_at > paused_at
  ),
  constraint recurring_gifts_provider_reference_required check (
    status = 'incomplete'
    or nullif(btrim(provider_subscription_reference), '') is not null
  ),
  constraint recurring_gifts_started_at_present check (
    status = 'incomplete' or started_at is not null
  ),
  constraint recurring_gifts_paused_at_present check (
    status <> 'paused' or paused_at is not null
  ),
  constraint recurring_gifts_canceled_at_present check (
    status <> 'canceled' or canceled_at is not null
  )
);

create unique index recurring_gifts_provider_subscription_unique_idx
  on public.recurring_gifts (payment_connection_id, provider_subscription_reference)
  where provider_subscription_reference is not null;
create index recurring_gifts_donor_idx on public.recurring_gifts (church_id, donor_id, status);
create index recurring_gifts_fund_fk_idx on public.recurring_gifts (church_id, fund_id);
create index recurring_gifts_campaign_fk_idx
  on public.recurring_gifts (church_id, campaign_id)
  where campaign_id is not null;
create index recurring_gifts_connection_fk_idx
  on public.recurring_gifts (church_id, payment_connection_id);
create index recurring_gifts_next_charge_idx on public.recurring_gifts (next_charge_at)
  where status in ('active', 'past_due');

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  donor_id uuid,
  fund_id uuid not null,
  campaign_id uuid,
  recurring_gift_id uuid,
  payment_connection_id uuid,
  source public.donation_source not null default 'online',
  status public.donation_status not null default 'pending',
  amount_minor bigint not null,
  currency text not null,
  processing_fee_minor bigint not null default 0,
  refunded_amount_minor bigint not null default 0,
  net_amount_minor bigint generated always as (
    amount_minor - processing_fee_minor - refunded_amount_minor
  ) stored,
  provider_payment_reference text,
  provider_charge_reference text,
  payment_method_brand text,
  payment_method_last4 text,
  donor_display_name text,
  donor_email text,
  donor_message text,
  external_idempotency_key text,
  failure_code text,
  failure_message text,
  donated_at timestamptz,
  settled_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donations_tenant_key unique (church_id, id),
  constraint donations_tenant_donor_key unique (church_id, id, donor_id),
  constraint donations_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint donations_fund_tenant_fk foreign key (church_id, fund_id)
    references public.funds(church_id, id) on delete restrict,
  constraint donations_campaign_tenant_fk foreign key (church_id, campaign_id)
    references public.campaigns(church_id, id) on delete restrict,
  constraint donations_recurring_identity_tenant_fk
    foreign key (church_id, recurring_gift_id, donor_id, payment_connection_id)
    references public.recurring_gifts(church_id, id, donor_id, payment_connection_id)
    on delete restrict,
  constraint donations_connection_tenant_fk foreign key (church_id, payment_connection_id)
    references public.payment_provider_connections(church_id, id) on delete restrict,
  constraint donations_amount_positive check (amount_minor > 0),
  constraint donations_fee_nonnegative check (processing_fee_minor >= 0),
  constraint donations_refund_range check (
    refunded_amount_minor >= 0 and refunded_amount_minor <= amount_minor
  ),
  constraint donations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint donations_last4_format check (
    payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'
  ),
  constraint donations_online_connection_required check (
    source <> 'online' or payment_connection_id is not null
  ),
  constraint donations_recurring_identity_required check (
    recurring_gift_id is null
    or (donor_id is not null and payment_connection_id is not null)
  ),
  constraint donations_idempotency_key_not_blank check (
    external_idempotency_key is null or btrim(external_idempotency_key) <> ''
  ),
  constraint donations_online_idempotency_required check (
    source <> 'online' or external_idempotency_key is not null
  ),
  constraint donations_refunded_status_amount check (
    status <> 'refunded' or refunded_amount_minor = amount_minor
  ),
  constraint donations_partial_refund_status_amount check (
    status <> 'partially_refunded'
    or (refunded_amount_minor > 0 and refunded_amount_minor < amount_minor)
  ),
  constraint donations_success_timestamp_present check (
    status not in ('succeeded', 'partially_refunded', 'refunded', 'disputed')
    or donated_at is not null
  ),
  constraint donations_failure_timestamp_present check (
    status <> 'failed' or failed_at is not null
  ),
  constraint donations_refund_timestamp_present check (
    status not in ('partially_refunded', 'refunded') or refunded_at is not null
  ),
  constraint donations_refund_state_consistent check (
    (refunded_amount_minor = 0 and refunded_at is null)
    or (
      refunded_amount_minor > 0
      and status in ('partially_refunded', 'refunded', 'disputed')
      and refunded_at is not null
    )
  )
);

create unique index donations_provider_payment_unique_idx
  on public.donations (payment_connection_id, provider_payment_reference)
  where provider_payment_reference is not null;
create unique index donations_idempotency_unique_idx
  on public.donations (church_id, external_idempotency_key)
  where external_idempotency_key is not null;
create index donations_church_date_idx on public.donations (church_id, donated_at desc, created_at desc);
create index donations_church_status_idx on public.donations (church_id, status, created_at desc);
create index donations_donor_idx on public.donations (church_id, donor_id, donated_at desc);
create index donations_fund_idx on public.donations (church_id, fund_id, donated_at desc);
create index donations_campaign_idx on public.donations (church_id, campaign_id, donated_at desc)
  where campaign_id is not null;
create index donations_recurring_idx on public.donations (church_id, recurring_gift_id, donated_at desc)
  where recurring_gift_id is not null;
create index donations_connection_fk_idx
  on public.donations (church_id, payment_connection_id)
  where payment_connection_id is not null;
create index donations_created_by_fk_idx on public.donations (created_by)
  where created_by is not null;

comment on column public.donations.payment_method_last4 is
  'Display-only last four digits returned by the provider; never store a PAN, CVC, or expiry.';
comment on column public.donations.net_amount_minor is
  'Gross minus processor fee minus refunded amount. This may be negative after a full refund when processor fees are not returned.';

create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  donation_id uuid not null,
  donor_id uuid,
  body text not null,
  consented_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_requests_tenant_key unique (church_id, id),
  constraint prayer_requests_donation_tenant_fk foreign key (church_id, donation_id)
    references public.donations(church_id, id) on delete restrict,
  constraint prayer_requests_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint prayer_requests_donation_donor_match_fk
    foreign key (church_id, donation_id, donor_id)
    references public.donations(church_id, id, donor_id) on delete restrict,
  constraint prayer_requests_one_per_donation unique (donation_id),
  constraint prayer_requests_body_not_blank check (btrim(body) <> '')
);

create index prayer_requests_unreviewed_idx on public.prayer_requests (church_id, created_at)
  where reviewed_at is null and deleted_at is null;
create index prayer_requests_donor_fk_idx on public.prayer_requests (church_id, donor_id)
  where donor_id is not null;
create index prayer_requests_reviewed_by_fk_idx on public.prayer_requests (reviewed_by)
  where reviewed_by is not null;

-- -----------------------------------------------------------------------------
-- Receipts and annual statements
-- -----------------------------------------------------------------------------

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  donation_id uuid not null,
  donor_id uuid,
  receipt_number text not null,
  version integer not null default 1,
  status public.receipt_status not null default 'draft',
  amount_minor bigint not null,
  currency text not null,
  recipient_email text,
  document_path text,
  issued_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipts_tenant_key unique (church_id, id),
  constraint receipts_tenant_donor_key unique (church_id, id, donor_id),
  constraint receipts_donation_tenant_fk foreign key (church_id, donation_id)
    references public.donations(church_id, id) on delete restrict,
  constraint receipts_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint receipts_donation_donor_match_fk
    foreign key (church_id, donation_id, donor_id)
    references public.donations(church_id, id, donor_id) on delete restrict,
  constraint receipts_number_not_blank check (btrim(receipt_number) <> ''),
  constraint receipts_amount_positive check (amount_minor > 0),
  constraint receipts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint receipts_version_positive check (version > 0),
  constraint receipts_issued_at_present check (status <> 'issued' or issued_at is not null),
  constraint receipts_voided_at_present check (status <> 'voided' or voided_at is not null),
  constraint receipts_donation_version_unique unique (donation_id, version)
);

create unique index receipts_number_unique_idx on public.receipts (church_id, receipt_number);
create index receipts_donor_idx on public.receipts (church_id, donor_id, issued_at desc);

create table public.annual_statements (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  donor_id uuid not null,
  tax_year integer not null,
  version integer not null default 1,
  statement_number text not null,
  status public.statement_status not null default 'draft',
  currency text not null,
  total_amount_minor bigint not null default 0,
  period_start date not null,
  period_end date not null,
  document_path text,
  generated_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  supersedes_statement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_statements_tenant_key unique (church_id, id),
  constraint annual_statements_tenant_donor_key unique (church_id, id, donor_id),
  constraint annual_statements_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint annual_statements_supersedes_donor_tenant_fk
    foreign key (church_id, supersedes_statement_id, donor_id)
    references public.annual_statements(church_id, id, donor_id) on delete restrict,
  constraint annual_statements_year_valid check (tax_year between 2000 and 2200),
  constraint annual_statements_version_positive check (version > 0),
  constraint annual_statements_number_not_blank check (btrim(statement_number) <> ''),
  constraint annual_statements_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint annual_statements_total_nonnegative check (total_amount_minor >= 0),
  constraint annual_statements_period_valid check (period_end >= period_start),
  constraint annual_statements_not_self_superseding check (
    supersedes_statement_id is null or supersedes_statement_id <> id
  ),
  constraint annual_statements_published_at_present check (
    status <> 'published' or published_at is not null
  ),
  constraint annual_statements_donor_year_version_unique unique (church_id, donor_id, tax_year, version)
);

create unique index annual_statements_number_unique_idx
  on public.annual_statements (church_id, statement_number);
create index annual_statements_donor_idx
  on public.annual_statements (church_id, donor_id, tax_year desc, version desc);
create index annual_statements_supersedes_fk_idx
  on public.annual_statements (church_id, supersedes_statement_id)
  where supersedes_statement_id is not null;
create index annual_statements_reviewed_by_fk_idx
  on public.annual_statements (reviewed_by)
  where reviewed_by is not null;

create table public.statement_donations (
  church_id uuid not null references public.churches(id) on delete cascade,
  statement_id uuid not null,
  donation_id uuid not null,
  donor_id uuid not null,
  included_amount_minor bigint not null,
  created_at timestamptz not null default now(),
  primary key (statement_id, donation_id),
  constraint statement_donations_statement_donor_match_fk
    foreign key (church_id, statement_id, donor_id)
    references public.annual_statements(church_id, id, donor_id) on delete cascade,
  constraint statement_donations_donation_donor_match_fk
    foreign key (church_id, donation_id, donor_id)
    references public.donations(church_id, id, donor_id) on delete restrict,
  constraint statement_donations_amount_positive check (included_amount_minor > 0)
);

create index statement_donations_church_donation_idx
  on public.statement_donations (church_id, donation_id);

-- -----------------------------------------------------------------------------
-- Platform billing and provider reconciliation
-- -----------------------------------------------------------------------------

create table public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null unique references public.churches(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_reference text,
  provider_subscription_reference text,
  status public.platform_subscription_status not null default 'incomplete',
  plan_code text not null,
  amount_minor bigint not null,
  currency text not null default 'USD',
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_subscriptions_tenant_key unique (church_id, id),
  constraint platform_subscriptions_provider_not_blank check (btrim(provider) <> ''),
  constraint platform_subscriptions_plan_not_blank check (btrim(plan_code) <> ''),
  constraint platform_subscriptions_amount_positive check (amount_minor > 0),
  constraint platform_subscriptions_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint platform_subscriptions_period_valid check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create unique index platform_subscriptions_provider_unique_idx
  on public.platform_subscriptions (lower(provider), provider_subscription_reference)
  where provider_subscription_reference is not null;
create index platform_subscriptions_status_idx
  on public.platform_subscriptions (status, current_period_end);

create table public.payment_provider_references (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  connection_id uuid,
  provider text not null,
  object_type public.provider_object_type not null,
  external_reference text not null,
  donor_id uuid,
  donation_id uuid,
  recurring_gift_id uuid,
  platform_subscription_id uuid,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_references_tenant_key unique (church_id, id),
  constraint payment_provider_references_connection_tenant_fk foreign key (church_id, connection_id)
    references public.payment_provider_connections(church_id, id) on delete restrict,
  constraint payment_provider_references_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint payment_provider_references_donation_tenant_fk foreign key (church_id, donation_id)
    references public.donations(church_id, id) on delete restrict,
  constraint payment_provider_references_recurring_tenant_fk foreign key (church_id, recurring_gift_id)
    references public.recurring_gifts(church_id, id) on delete restrict,
  constraint payment_provider_references_platform_subscription_tenant_fk
    foreign key (church_id, platform_subscription_id)
    references public.platform_subscriptions(church_id, id) on delete restrict,
  constraint payment_provider_references_provider_not_blank check (btrim(provider) <> ''),
  constraint payment_provider_references_external_not_blank check (btrim(external_reference) <> ''),
  constraint payment_provider_references_metadata_object check (jsonb_typeof(sanitized_metadata) = 'object'),
  constraint payment_provider_references_one_parent check (
    num_nonnulls(donor_id, donation_id, recurring_gift_id, platform_subscription_id) <= 1
  ),
  constraint payment_provider_references_church_object_has_connection check (
    num_nonnulls(donor_id, donation_id, recurring_gift_id) = 0
    or connection_id is not null
  )
);

create unique index payment_provider_references_connection_external_unique_idx
  on public.payment_provider_references (connection_id, object_type, external_reference)
  where connection_id is not null;
create unique index payment_provider_references_platform_external_unique_idx
  on public.payment_provider_references (lower(provider), church_id, object_type, external_reference)
  where connection_id is null;
create index payment_provider_references_donor_idx
  on public.payment_provider_references (church_id, donor_id)
  where donor_id is not null;
create index payment_provider_references_donation_idx
  on public.payment_provider_references (church_id, donation_id)
  where donation_id is not null;
create index payment_provider_references_recurring_idx
  on public.payment_provider_references (church_id, recurring_gift_id)
  where recurring_gift_id is not null;
create index payment_provider_references_subscription_fk_idx
  on public.payment_provider_references (church_id, platform_subscription_id)
  where platform_subscription_id is not null;

comment on table public.payment_provider_references is
  'External provider object IDs plus sanitized metadata. No raw card, bank, credential, or webhook data.';

-- -----------------------------------------------------------------------------
-- QR links and operational events
-- -----------------------------------------------------------------------------

create table public.qr_links (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  kind public.qr_link_kind not null default 'church',
  fund_id uuid,
  campaign_id uuid,
  short_code text not null default replace(gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  scan_count bigint not null default 0,
  last_scanned_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_links_tenant_key unique (church_id, id),
  constraint qr_links_fund_tenant_fk foreign key (church_id, fund_id)
    references public.funds(church_id, id) on delete restrict,
  constraint qr_links_campaign_tenant_fk foreign key (church_id, campaign_id)
    references public.campaigns(church_id, id) on delete restrict,
  constraint qr_links_short_code_format check (
    char_length(short_code) between 8 and 64
    and lower(short_code) = short_code
    and short_code ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
  ),
  constraint qr_links_scan_count_nonnegative check (scan_count >= 0),
  constraint qr_links_v1_church_only check (
    kind = 'church' and fund_id is null and campaign_id is null
  )
);

create unique index qr_links_short_code_unique_idx on public.qr_links (lower(short_code));
create unique index qr_links_one_church_code_idx on public.qr_links (church_id);
create index qr_links_created_by_fk_idx on public.qr_links (created_by)
  where created_by is not null;

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) on delete cascade,
  connection_id uuid,
  provider text not null,
  external_event_reference text not null,
  event_type text not null,
  status public.webhook_processing_status not null default 'received',
  payload_sha256 text,
  sanitized_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_events_connection_tenant_fk foreign key (church_id, connection_id)
    references public.payment_provider_connections(church_id, id) on delete restrict,
  constraint webhook_events_provider_not_blank check (btrim(provider) <> ''),
  constraint webhook_events_external_not_blank check (btrim(external_event_reference) <> ''),
  constraint webhook_events_type_not_blank check (btrim(event_type) <> ''),
  constraint webhook_events_attempts_nonnegative check (attempt_count >= 0),
  constraint webhook_events_payload_object check (jsonb_typeof(sanitized_payload) = 'object'),
  constraint webhook_events_connection_has_church check (connection_id is null or church_id is not null)
);

create unique index webhook_events_external_unique_idx
  on public.webhook_events (lower(provider), external_event_reference);
create index webhook_events_retry_idx on public.webhook_events (status, next_retry_at)
  where status in ('received', 'failed');
create index webhook_events_church_idx on public.webhook_events (church_id, received_at desc);
create index webhook_events_connection_fk_idx
  on public.webhook_events (church_id, connection_id)
  where connection_id is not null;

comment on column public.webhook_events.sanitized_payload is
  'Allowlisted event fields only. Raw provider payloads may contain regulated payment data and must not be persisted here.';

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) on delete cascade,
  donor_id uuid,
  donation_id uuid,
  receipt_id uuid,
  annual_statement_id uuid,
  template_key text not null,
  recipient_email text not null,
  provider text,
  provider_message_reference text,
  status public.email_delivery_status not null default 'queued',
  attempt_count integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_events_donor_tenant_fk foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint email_events_donation_tenant_fk foreign key (church_id, donation_id)
    references public.donations(church_id, id) on delete restrict,
  constraint email_events_donation_donor_match_fk
    foreign key (church_id, donation_id, donor_id)
    references public.donations(church_id, id, donor_id) on delete restrict,
  constraint email_events_receipt_tenant_fk foreign key (church_id, receipt_id)
    references public.receipts(church_id, id) on delete restrict,
  constraint email_events_receipt_donor_match_fk
    foreign key (church_id, receipt_id, donor_id)
    references public.receipts(church_id, id, donor_id) on delete restrict,
  constraint email_events_statement_tenant_fk foreign key (church_id, annual_statement_id)
    references public.annual_statements(church_id, id) on delete restrict,
  constraint email_events_statement_donor_match_fk
    foreign key (church_id, annual_statement_id, donor_id)
    references public.annual_statements(church_id, id, donor_id) on delete restrict,
  constraint email_events_tenant_required_for_related_record check (
    church_id is not null
    or num_nonnulls(donor_id, donation_id, receipt_id, annual_statement_id) = 0
  ),
  constraint email_events_template_not_blank check (btrim(template_key) <> ''),
  constraint email_events_recipient_not_blank check (btrim(recipient_email) <> ''),
  constraint email_events_attempts_nonnegative check (attempt_count >= 0)
);

create unique index email_events_provider_message_unique_idx
  on public.email_events (lower(provider), provider_message_reference)
  where provider is not null and provider_message_reference is not null;
create index email_events_queue_idx on public.email_events (status, queued_at)
  where status in ('queued', 'failed');
create index email_events_church_idx on public.email_events (church_id, created_at desc);
create index email_events_donor_fk_idx on public.email_events (church_id, donor_id)
  where donor_id is not null;
create index email_events_donation_fk_idx on public.email_events (church_id, donation_id)
  where donation_id is not null;
create index email_events_receipt_fk_idx on public.email_events (church_id, receipt_id)
  where receipt_id is not null;
create index email_events_statement_fk_idx
  on public.email_events (church_id, annual_statement_id)
  where annual_statement_id is not null;

create table public.audit_logs (
  id bigint generated by default as identity primary key,
  church_id uuid references public.churches(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type public.audit_actor_type not null default 'user',
  action text not null,
  entity_table text not null,
  entity_id text,
  request_id text,
  ip_hash text,
  sanitized_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (btrim(action) <> ''),
  constraint audit_logs_table_not_blank check (btrim(entity_table) <> ''),
  constraint audit_logs_changes_object check (jsonb_typeof(sanitized_changes) = 'object')
);

create index audit_logs_church_created_idx on public.audit_logs (church_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc)
  where actor_user_id is not null;
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, created_at desc);

comment on table public.audit_logs is
  'Append-only audit trail. sanitized_changes must exclude secrets, full payment data, and prayer-request contents.';

-- -----------------------------------------------------------------------------
-- Integrity and provisioning triggers
-- -----------------------------------------------------------------------------

create or replace function public.validate_gift_campaign_fund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1
    from public.campaigns c
    where c.id = new.campaign_id
      and c.church_id = new.church_id
      and (c.fund_id is null or c.fund_id = new.fund_id)
      and c.currency = new.currency
  ) then
    raise exception 'campaign, fund, and currency must belong to the same giving route';
  end if;

  return new;
end;
$$;

create or replace function public.validate_receipt_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  donation_amount_minor bigint;
  donation_currency text;
  donation_donor_id uuid;
  donation_status public.donation_status;
begin
  select d.amount_minor, d.currency, d.donor_id, d.status
  into donation_amount_minor, donation_currency, donation_donor_id, donation_status
  from public.donations d
  where d.id = new.donation_id
    and d.church_id = new.church_id;

  if not found then
    raise exception 'receipt donation was not found in the church';
  end if;

  if donation_status in ('pending', 'processing', 'failed', 'canceled') then
    raise exception 'receipt requires a successfully collected donation';
  end if;

  if new.amount_minor <> donation_amount_minor
    or new.currency <> donation_currency
    or new.donor_id is distinct from donation_donor_id then
    raise exception 'receipt snapshot must match the donation';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Backfill profiles if this migration is applied after auth users already exist.
insert into public.profiles (id, email, display_name)
select
  user_row.id,
  user_row.email,
  coalesce(
    user_row.raw_user_meta_data ->> 'display_name',
    user_row.raw_user_meta_data ->> 'full_name'
  )
from auth.users user_row
on conflict (id) do nothing;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_auth_user_email();

create or replace function public.create_default_church_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.funds (
    church_id,
    name,
    slug,
    description,
    status,
    is_default,
    sort_order,
    created_by
  ) values (
    new.id,
    'Tithes',
    'tithes',
    'General tithes',
    'active',
    true,
    0,
    new.created_by
  );

  insert into public.qr_links (church_id, kind, is_active, created_by)
  values (new.id, 'church', true, new.created_by);

  return new;
end;
$$;

create or replace function public.enforce_one_active_default_fund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_church_id uuid;
  active_default_count bigint;
begin
  target_church_id := case
    when tg_op = 'DELETE' then old.church_id
    else new.church_id
  end;

  -- Cascading church deletion removes its funds; there is no tenant invariant
  -- left to enforce once the parent church no longer exists.
  if not exists (
    select 1 from public.churches c where c.id = target_church_id
  ) then
    return null;
  end if;

  select count(*)
  into active_default_count
  from public.funds f
  where f.church_id = target_church_id
    and f.is_default
    and f.status = 'active';

  if active_default_count <> 1 then
    raise exception 'church must have exactly one active default fund';
  end if;

  return null;
end;
$$;

create or replace function public.enforce_one_church_qr_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_church_id uuid;
  qr_link_count bigint;
begin
  target_church_id := case
    when tg_op = 'DELETE' then old.church_id
    else new.church_id
  end;

  -- A cascading church deletion has no remaining tenant invariant to enforce.
  if not exists (
    select 1 from public.churches c where c.id = target_church_id
  ) then
    return null;
  end if;

  select count(*)
  into qr_link_count
  from public.qr_links q
  where q.church_id = target_church_id;

  if qr_link_count <> 1 then
    raise exception 'church must have exactly one permanent QR link';
  end if;

  return null;
end;
$$;

create trigger on_church_created
  after insert on public.churches
  for each row execute function public.create_default_church_records();

create constraint trigger funds_require_one_active_default
  after insert or update or delete on public.funds
  deferrable initially deferred
  for each row execute function public.enforce_one_active_default_fund();

create constraint trigger qr_links_require_one_per_church
  after insert or update or delete on public.qr_links
  deferrable initially deferred
  for each row execute function public.enforce_one_church_qr_link();

revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_auth_user_email()
  from public, anon, authenticated, service_role;
revoke all on function public.create_default_church_records()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_one_active_default_fund()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_one_church_qr_link()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_gift_campaign_fund()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_receipt_snapshot()
  from public, anon, authenticated, service_role;

create trigger recurring_gifts_validate_campaign_fund
  before insert or update of church_id, campaign_id, fund_id, currency
  on public.recurring_gifts
  for each row execute function public.validate_gift_campaign_fund();
create trigger donations_validate_campaign_fund
  before insert or update of church_id, campaign_id, fund_id, currency
  on public.donations
  for each row execute function public.validate_gift_campaign_fund();
create trigger receipts_validate_snapshot
  before insert or update on public.receipts
  for each row execute function public.validate_receipt_snapshot();

-- Keep mutable timestamps trustworthy.
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger platform_admins_set_updated_at before update on public.platform_admins
  for each row execute function public.set_updated_at();
create trigger churches_set_updated_at before update on public.churches
  for each row execute function public.set_updated_at();
create trigger church_memberships_set_updated_at before update on public.church_memberships
  for each row execute function public.set_updated_at();
create trigger funds_set_updated_at before update on public.funds
  for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger donors_set_updated_at before update on public.donors
  for each row execute function public.set_updated_at();
create trigger payment_provider_connections_set_updated_at before update on public.payment_provider_connections
  for each row execute function public.set_updated_at();
create trigger recurring_gifts_set_updated_at before update on public.recurring_gifts
  for each row execute function public.set_updated_at();
create trigger donations_set_updated_at before update on public.donations
  for each row execute function public.set_updated_at();
create trigger prayer_requests_set_updated_at before update on public.prayer_requests
  for each row execute function public.set_updated_at();
create trigger receipts_set_updated_at before update on public.receipts
  for each row execute function public.set_updated_at();
create trigger annual_statements_set_updated_at before update on public.annual_statements
  for each row execute function public.set_updated_at();
create trigger platform_subscriptions_set_updated_at before update on public.platform_subscriptions
  for each row execute function public.set_updated_at();
create trigger payment_provider_references_set_updated_at before update on public.payment_provider_references
  for each row execute function public.set_updated_at();
create trigger qr_links_set_updated_at before update on public.qr_links
  for each row execute function public.set_updated_at();
create trigger webhook_events_set_updated_at before update on public.webhook_events
  for each row execute function public.set_updated_at();
create trigger email_events_set_updated_at before update on public.email_events
  for each row execute function public.set_updated_at();

-- Tenant keys are immutable after insertion. This prevents an allowed row update
-- from being abused to move a record into another church.
create trigger church_memberships_keep_tenant before update on public.church_memberships
  for each row execute function public.prevent_church_id_change();
create trigger funds_keep_tenant before update on public.funds
  for each row execute function public.prevent_church_id_change();
create trigger campaigns_keep_tenant before update on public.campaigns
  for each row execute function public.prevent_church_id_change();
create trigger donors_keep_tenant before update on public.donors
  for each row execute function public.prevent_church_id_change();
create trigger payment_provider_connections_keep_tenant before update on public.payment_provider_connections
  for each row execute function public.prevent_church_id_change();
create trigger recurring_gifts_keep_tenant before update on public.recurring_gifts
  for each row execute function public.prevent_church_id_change();
create trigger donations_keep_snapshot before update on public.donations
  for each row execute function public.prevent_donation_snapshot_change();
create trigger donations_keep_tenant before update on public.donations
  for each row execute function public.prevent_church_id_change();
create trigger prayer_requests_keep_tenant before update on public.prayer_requests
  for each row execute function public.prevent_church_id_change();
create trigger receipts_keep_tenant before update on public.receipts
  for each row execute function public.prevent_church_id_change();
create trigger annual_statements_keep_tenant before update on public.annual_statements
  for each row execute function public.prevent_church_id_change();
create trigger platform_subscriptions_keep_tenant before update on public.platform_subscriptions
  for each row execute function public.prevent_church_id_change();
create trigger payment_provider_references_keep_tenant before update on public.payment_provider_references
  for each row execute function public.prevent_church_id_change();
create trigger qr_links_keep_tenant before update on public.qr_links
  for each row execute function public.prevent_church_id_change();
create trigger qr_links_keep_routing before update on public.qr_links
  for each row execute function public.prevent_qr_routing_change();
create trigger webhook_events_keep_routing before update on public.webhook_events
  for each row execute function public.protect_webhook_routing();
create trigger email_events_keep_tenant before update on public.email_events
  for each row execute function public.prevent_church_id_change();
create trigger statement_donations_keep_tenant before update on public.statement_donations
  for each row execute function public.prevent_church_id_change();
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.reject_audit_log_mutation();
create trigger audit_logs_reject_truncate before truncate on public.audit_logs
  for each statement execute function public.reject_audit_log_mutation();

-- -----------------------------------------------------------------------------
-- RLS helper functions
-- SECURITY DEFINER avoids recursive membership policies. Every helper has a
-- fixed search_path and is exposed only to the authenticated role below.
-- -----------------------------------------------------------------------------

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active
      and pa.role = 'super_admin'
  );
$$;

create or replace function public.is_church_member(target_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.church_memberships cm
    where cm.church_id = target_church_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
$$;

create or replace function public.has_church_role(
  target_church_id uuid,
  allowed_roles public.church_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.church_memberships cm
    where cm.church_id = target_church_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role = any(allowed_roles)
  );
$$;

create or replace function public.owns_donor(target_donor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.donors d
    where d.id = target_donor_id
      and d.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_super_admin()
  from public, anon, authenticated, service_role;
revoke all on function public.is_church_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.has_church_role(uuid, public.church_member_role[])
  from public, anon, authenticated, service_role;
revoke all on function public.owns_donor(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_platform_super_admin() to authenticated;
grant execute on function public.is_church_member(uuid) to authenticated;
grant execute on function public.has_church_role(uuid, public.church_member_role[]) to authenticated;
grant execute on function public.owns_donor(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.churches enable row level security;
alter table public.church_memberships enable row level security;
alter table public.funds enable row level security;
alter table public.campaigns enable row level security;
alter table public.donors enable row level security;
alter table public.payment_provider_connections enable row level security;
alter table public.recurring_gifts enable row level security;
alter table public.donations enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.receipts enable row level security;
alter table public.annual_statements enable row level security;
alter table public.statement_donations enable row level security;
alter table public.platform_subscriptions enable row level security;
alter table public.payment_provider_references enable row level security;
alter table public.qr_links enable row level security;
alter table public.webhook_events enable row level security;
alter table public.email_events enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles and platform administrators
create policy profiles_read_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy platform_admins_read
  on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_super_admin()));

-- Churches
create policy churches_public_read_active
  on public.churches for select to anon
  using (status = 'active');

create policy churches_members_read
  on public.churches for select to authenticated
  using (public.is_church_member(id));

create policy churches_platform_admin_read
  on public.churches for select to authenticated
  using ((select public.is_platform_super_admin()));

-- Church memberships
create policy church_memberships_read_own_or_owner
  on public.church_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_church_role(
      church_id,
      array['owner']::public.church_member_role[]
    )
  );

-- Public giving configuration
create policy funds_public_read_active
  on public.funds for select to anon
  using (
    status = 'active'
    and exists (
      select 1 from public.churches c
      where c.id = funds.church_id and c.status = 'active'
    )
  );

create policy funds_members_read
  on public.funds for select to authenticated
  using (public.is_church_member(church_id));

create policy funds_platform_admin_read
  on public.funds for select to authenticated
  using ((select public.is_platform_super_admin()));

create policy campaigns_public_read_active
  on public.campaigns for select to anon
  using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    and exists (
      select 1 from public.churches c
      where c.id = campaigns.church_id and c.status = 'active'
    )
  );

create policy campaigns_members_read
  on public.campaigns for select to authenticated
  using (public.is_church_member(church_id));

create policy campaigns_platform_admin_read
  on public.campaigns for select to authenticated
  using ((select public.is_platform_super_admin()));

-- Donors
create policy donors_read_own
  on public.donors for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy donors_finance_read
  on public.donors for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin', 'accountant']::public.church_member_role[]
    )
  );

-- Provider connections are readable by finance roles but mutations should flow
-- through trusted server code after provider onboarding/verification.
create policy payment_connections_finance_read
  on public.payment_provider_connections for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin']::public.church_member_role[]
    )
  );

-- Recurring gifts are provider-backed. Donors and church finance users can read
-- them; all changes go through server endpoints so provider and database state
-- remain synchronized.
create policy recurring_gifts_donor_read
  on public.recurring_gifts for select to authenticated
  using (public.owns_donor(donor_id));

create policy recurring_gifts_finance_read
  on public.recurring_gifts for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin', 'accountant']::public.church_member_role[]
    )
  );

-- Donations
create policy donations_donor_read
  on public.donations for select to authenticated
  using (donor_id is not null and public.owns_donor(donor_id));

create policy donations_finance_read
  on public.donations for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin', 'accountant']::public.church_member_role[]
    )
  );

-- Prayer requests are intentionally isolated from financial reporting access.
create policy prayer_requests_donor_read
  on public.prayer_requests for select to authenticated
  using (
    deleted_at is null
    and donor_id is not null
    and public.owns_donor(donor_id)
  );

create policy prayer_requests_pastoral_read
  on public.prayer_requests for select to authenticated
  using (
    deleted_at is null
    and public.has_church_role(
      church_id,
      array['owner', 'staff']::public.church_member_role[]
    )
  );

-- Receipts and annual statements
create policy receipts_donor_read
  on public.receipts for select to authenticated
  using (
    status = 'issued'
    and donor_id is not null
    and public.owns_donor(donor_id)
  );

create policy receipts_finance_read
  on public.receipts for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin', 'accountant']::public.church_member_role[]
    )
  );

create policy annual_statements_donor_read
  on public.annual_statements for select to authenticated
  using (status = 'published' and public.owns_donor(donor_id));

create policy annual_statements_finance_read
  on public.annual_statements for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin', 'accountant']::public.church_member_role[]
    )
  );

create policy statement_donations_donor_read
  on public.statement_donations for select to authenticated
  using (
    exists (
      select 1
      from public.annual_statements ast
      where ast.id = statement_donations.statement_id
        and ast.church_id = statement_donations.church_id
        and ast.status = 'published'
        and public.owns_donor(ast.donor_id)
    )
  );

create policy statement_donations_finance_read
  on public.statement_donations for select to authenticated
  using (
    public.has_church_role(
      church_id,
      array['owner', 'finance_admin', 'accountant']::public.church_member_role[]
    )
  );

-- Platform billing and provider reconciliation
create policy platform_subscriptions_owner_read
  on public.platform_subscriptions for select to authenticated
  using (public.has_church_role(church_id, array['owner']::public.church_member_role[]));

create policy platform_subscriptions_platform_admin_read
  on public.platform_subscriptions for select to authenticated
  using ((select public.is_platform_super_admin()));

-- QR links
create policy qr_links_public_read_active
  on public.qr_links for select to anon
  using (
    is_active
    and exists (
      select 1 from public.churches c
      where c.id = qr_links.church_id and c.status = 'active'
    )
  );

create policy qr_links_members_read
  on public.qr_links for select to authenticated
  using (public.is_church_member(church_id));

create policy qr_links_platform_admin_read
  on public.qr_links for select to authenticated
  using ((select public.is_platform_super_admin()));

-- Operational records
create policy email_events_finance_read
  on public.email_events for select to authenticated
  using (
    church_id is not null
    and public.has_church_role(
      church_id,
      array['owner', 'finance_admin']::public.church_member_role[]
    )
  );

create policy audit_logs_church_owner_read
  on public.audit_logs for select to authenticated
  using (
    church_id is not null
    and public.has_church_role(church_id, array['owner']::public.church_member_role[])
  );

-- -----------------------------------------------------------------------------
-- API privileges
-- RLS is the primary tenant boundary. Provider-backed state and append-only
-- operational tables are intentionally writable only through trusted server
-- code using the service role.
-- -----------------------------------------------------------------------------

revoke create on schema public from public;

revoke all privileges on table
  public.profiles,
  public.platform_admins,
  public.churches,
  public.church_memberships,
  public.funds,
  public.campaigns,
  public.donors,
  public.payment_provider_connections,
  public.recurring_gifts,
  public.donations,
  public.prayer_requests,
  public.receipts,
  public.annual_statements,
  public.statement_donations,
  public.platform_subscriptions,
  public.payment_provider_references,
  public.qr_links,
  public.webhook_events,
  public.email_events,
  public.audit_logs
from anon, authenticated, service_role;

revoke all privileges on sequence public.audit_logs_id_seq
  from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated;

-- Anonymous giving reads use an explicit public projection. Internal attribution,
-- analytics, legal, and operational columns are not available to anonymous API
-- clients even when the row is public under RLS.
grant select (
  id,
  name,
  slug,
  status,
  default_currency,
  timezone,
  logo_url,
  primary_color,
  secondary_color,
  thank_you_message,
  support_email
) on public.churches to anon;

grant select (
  id,
  church_id,
  name,
  slug,
  description,
  status,
  is_default,
  sort_order
) on public.funds to anon;

grant select (
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
) on public.campaigns to anon;

grant select (
  church_id,
  kind,
  fund_id,
  campaign_id,
  short_code,
  is_active
) on public.qr_links to anon;

grant select on table
  public.profiles,
  public.platform_admins,
  public.churches,
  public.church_memberships,
  public.funds,
  public.campaigns,
  public.donors,
  public.prayer_requests,
  public.receipts,
  public.annual_statements,
  public.statement_donations,
  public.qr_links,
  public.email_events,
  public.audit_logs
to authenticated;

-- Provider identifiers, idempotency values, and raw operational details remain
-- server-only. Authenticated readers receive only the fields required by the
-- member and church dashboards, with row access still constrained by RLS.
grant select (
  id,
  church_id,
  provider,
  status,
  is_primary,
  charges_enabled,
  recurring_enabled,
  payouts_enabled,
  supported_currencies,
  capabilities,
  last_synced_at,
  created_at,
  updated_at
) on public.payment_provider_connections to authenticated;

grant select (
  id,
  church_id,
  donor_id,
  fund_id,
  campaign_id,
  amount_minor,
  currency,
  frequency,
  status,
  payment_method_brand,
  payment_method_last4,
  started_at,
  next_charge_at,
  paused_at,
  resume_at,
  canceled_at,
  cancel_reason,
  created_at,
  updated_at
) on public.recurring_gifts to authenticated;

grant select (
  id,
  church_id,
  donor_id,
  fund_id,
  campaign_id,
  recurring_gift_id,
  source,
  status,
  amount_minor,
  currency,
  processing_fee_minor,
  refunded_amount_minor,
  net_amount_minor,
  payment_method_brand,
  payment_method_last4,
  donor_display_name,
  donor_email,
  donor_message,
  donated_at,
  settled_at,
  failed_at,
  refunded_at,
  created_at,
  updated_at
) on public.donations to authenticated;

grant select (
  id,
  church_id,
  provider,
  status,
  plan_code,
  amount_minor,
  currency,
  current_period_start,
  current_period_end,
  grace_period_ends_at,
  cancel_at_period_end,
  canceled_at,
  created_at,
  updated_at
) on public.platform_subscriptions to authenticated;

grant update (display_name, phone, avatar_url) on public.profiles to authenticated;

-- Application mutations stay closed until the corresponding audited workflow
-- task adds a narrowly scoped policy or transaction function.
grant select, insert, update, delete on table
  public.profiles,
  public.platform_admins,
  public.churches,
  public.church_memberships,
  public.funds,
  public.campaigns,
  public.donors,
  public.payment_provider_connections,
  public.recurring_gifts,
  public.donations,
  public.prayer_requests,
  public.receipts,
  public.annual_statements,
  public.statement_donations,
  public.platform_subscriptions,
  public.payment_provider_references,
  public.webhook_events,
  public.email_events
to service_role;

-- The service role can update QR analytics/availability, but cannot insert or
-- delete the single permanent routing record provisioned with each church.
grant select on public.qr_links to service_role;
grant update (is_active, scan_count, last_scanned_at, updated_at)
  on public.qr_links to service_role;

grant select, insert on public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

commit;
