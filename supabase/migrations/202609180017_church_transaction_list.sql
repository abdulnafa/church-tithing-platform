begin;

-- P20 exposes a bounded, tenant-scoped transaction projection. It deliberately
-- excludes donor contact details, donor messages, provider identifiers, raw
-- checkout data, and prayer-request linkage. CSV/report exports remain P21.

create type public.church_transaction_record as (
  transaction_id uuid,
  church_id uuid,
  donor_name text,
  fund_id uuid,
  fund_name text,
  campaign_id uuid,
  campaign_name text,
  recorded_at timestamptz,
  frequency text,
  recurring_status text,
  amount_minor bigint,
  currency text,
  processing_fee_minor bigint,
  refunded_amount_minor bigint,
  net_amount_minor bigint,
  payment_method_brand text,
  payment_method_last4 text,
  payment_status public.donation_status,
  cancellation_state text
);

create type public.church_transaction_fund_option as (
  fund_id uuid,
  fund_name text,
  fund_status public.fund_status
);

create type public.church_transaction_page as (
  church_id uuid,
  church_timezone text,
  transactions public.church_transaction_record[],
  fund_options public.church_transaction_fund_option[],
  next_cursor_created_at timestamptz,
  next_cursor_transaction_id uuid,
  has_more boolean
);

-- created_at is immutable transaction-attempt time. Unlike donated_at, it does
-- not move when a pending payment later succeeds, so it is safe for keysets.
create index donations_church_created_cursor_idx
  on public.donations (church_id, created_at desc, id desc);

create or replace function public.get_church_transaction_page(
  target_church_id uuid,
  transaction_page_size integer default 25,
  transaction_cursor_created_at timestamptz default null,
  transaction_cursor_id uuid default null,
  transaction_date_from date default null,
  transaction_date_to date default null,
  transaction_donor_query text default null,
  transaction_min_amount_minor bigint default null,
  transaction_max_amount_minor bigint default null,
  transaction_fund_id uuid default null,
  transaction_recurring_state text default null,
  transaction_last4 text default null,
  transaction_payment_status public.donation_status default null,
  transaction_cancellation_state text default null
)
returns public.church_transaction_page
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_timezone text;
  canonical_donor_query text;
  date_start_at timestamptz;
  date_end_before timestamptz;
  result_page public.church_transaction_page;
begin
  if (select auth.uid()) is null
    or target_church_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'financial_read'
    ))
  then
    raise exception using
      errcode = '42501',
      message = 'CHURCH_TRANSACTIONS_FORBIDDEN';
  end if;

  select church.timezone
  into selected_timezone
  from public.churches church
  where church.id = target_church_id
    and church.status in ('active', 'onboarding');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'CHURCH_TRANSACTIONS_FORBIDDEN';
  end if;

  if transaction_page_size is null
    or transaction_page_size not between 1 and 50
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_PAGE_SIZE';
  end if;

  if (transaction_cursor_created_at is null) <>
    (transaction_cursor_id is null)
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_CURSOR';
  end if;

  if transaction_date_from is not null and (
      transaction_date_from < date '0001-01-01'
      or transaction_date_from > date '9999-12-30'
    )
    or transaction_date_to is not null and (
      transaction_date_to < date '0001-01-01'
      or transaction_date_to > date '9999-12-30'
    )
    or (
      transaction_date_from is not null
      and transaction_date_to is not null
      and transaction_date_from > transaction_date_to
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_DATE_RANGE';
  end if;

  canonical_donor_query := case
    when transaction_donor_query is null then null
    else public.canonicalize_public_display_name(transaction_donor_query)
  end;

  if transaction_donor_query is not null and (
      canonical_donor_query is null
      or pg_catalog.char_length(canonical_donor_query) not between 1 and 120
      or canonical_donor_query ~ '[[:cntrl:]]'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_DONOR_QUERY';
  end if;

  if transaction_min_amount_minor is not null
      and transaction_min_amount_minor < 0
    or transaction_max_amount_minor is not null
      and transaction_max_amount_minor < 0
    or transaction_min_amount_minor is not null
      and transaction_max_amount_minor is not null
      and transaction_min_amount_minor > transaction_max_amount_minor
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_AMOUNT_RANGE';
  end if;

  if transaction_recurring_state is not null
    and transaction_recurring_state not in (
      'one_time',
      'recurring',
      'incomplete',
      'active',
      'paused',
      'past_due',
      'canceled'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_RECURRING_STATE';
  end if;

  if transaction_last4 is not null
    and transaction_last4 !~ '^[0-9]{4}$'
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_LAST4';
  end if;

  if transaction_cancellation_state is not null
    and transaction_cancellation_state not in (
      'not_canceled',
      'payment_canceled',
      'recurring_canceled',
      'any_canceled'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_TRANSACTIONS_INVALID_CANCELLATION_STATE';
  end if;

  date_start_at := case
    when transaction_date_from is null then null
    else transaction_date_from::timestamp without time zone
      at time zone selected_timezone
  end;
  date_end_before := case
    when transaction_date_to is null then null
    else (transaction_date_to + 1)::timestamp without time zone
      at time zone selected_timezone
  end;

  result_page.church_id := target_church_id;
  result_page.church_timezone := selected_timezone;

  select coalesce(
    pg_catalog.array_agg(
      row(
        fund.id,
        public.canonicalize_public_display_name(fund.name),
        fund.status
      )::public.church_transaction_fund_option
      order by
        case when fund.status = 'active' then 0 else 1 end,
        case when fund.status = 'active' then fund.sort_order end nulls last,
        pg_catalog.lower(fund.name),
        fund.id
    ),
    array[]::public.church_transaction_fund_option[]
  )
  into result_page.fund_options
  from public.funds fund
  where fund.church_id = target_church_id;

  with base_records as (
    select
      donation.id as transaction_id,
      donation.church_id,
      coalesce(
        public.canonicalize_public_display_name(donation.donor_display_name),
        'Anonymous donor'
      ) as donor_name,
      fund.id as fund_id,
      public.canonicalize_public_display_name(fund.name) as fund_name,
      campaign.id as campaign_id,
      case
        when campaign.id is null then null
        else public.canonicalize_public_display_name(campaign.name)
      end as campaign_name,
      donation.created_at as recorded_at,
      recurring.frequency::text as frequency,
      recurring.status::text as recurring_status,
      donation.amount_minor,
      donation.currency,
      donation.processing_fee_minor,
      donation.refunded_amount_minor,
      donation.net_amount_minor,
      case
        when donation.payment_method_brand is not null
          and donation.payment_method_brand =
            public.canonicalize_public_display_name(
              donation.payment_method_brand
            )
          and pg_catalog.char_length(donation.payment_method_brand)
            between 1 and 40
          and donation.payment_method_brand !~ '[[:cntrl:]]'
          then donation.payment_method_brand
        else null
      end as payment_method_brand,
      donation.payment_method_last4,
      donation.status as payment_status,
      case
        when donation.status = 'canceled'
          and recurring.status = 'canceled'
          then 'payment_and_recurring_canceled'
        when donation.status = 'canceled' then 'payment_canceled'
        when recurring.status = 'canceled' then 'recurring_canceled'
        else 'not_canceled'
      end as cancellation_state
    from public.donations donation
    join public.funds fund
      on fund.church_id = donation.church_id
      and fund.id = donation.fund_id
    left join public.campaigns campaign
      on campaign.church_id = donation.church_id
      and campaign.id = donation.campaign_id
    left join public.recurring_gifts recurring
      on recurring.church_id = donation.church_id
      and recurring.id = donation.recurring_gift_id
    where donation.church_id = target_church_id
      and (
        date_start_at is null
        or donation.created_at >= date_start_at
      )
      and (
        date_end_before is null
        or donation.created_at < date_end_before
      )
      and (
        canonical_donor_query is null
        or pg_catalog.strpos(
          pg_catalog.lower(coalesce(donation.donor_display_name, '')),
          pg_catalog.lower(canonical_donor_query)
        ) > 0
      )
      and (
        transaction_min_amount_minor is null
        or donation.amount_minor >= transaction_min_amount_minor
      )
      and (
        transaction_max_amount_minor is null
        or donation.amount_minor <= transaction_max_amount_minor
      )
      and (
        transaction_fund_id is null
        or donation.fund_id = transaction_fund_id
      )
      and (
        transaction_last4 is null
        or donation.payment_method_last4 = transaction_last4
      )
      and (
        transaction_payment_status is null
        or donation.status = transaction_payment_status
      )
  ), filtered_records as (
    select record.*
    from base_records record
    where (
      transaction_recurring_state is null
      or transaction_recurring_state = 'one_time'
        and record.recurring_status is null
      or transaction_recurring_state = 'recurring'
        and record.recurring_status is not null
      or transaction_recurring_state in (
          'incomplete', 'active', 'paused', 'past_due', 'canceled'
        )
        and record.recurring_status = transaction_recurring_state
    )
      and (
        transaction_cancellation_state is null
        or transaction_cancellation_state = 'not_canceled'
          and record.cancellation_state = 'not_canceled'
        or transaction_cancellation_state = 'payment_canceled'
          and record.cancellation_state in (
            'payment_canceled', 'payment_and_recurring_canceled'
          )
        or transaction_cancellation_state = 'recurring_canceled'
          and record.cancellation_state in (
            'recurring_canceled', 'payment_and_recurring_canceled'
          )
        or transaction_cancellation_state = 'any_canceled'
          and record.cancellation_state <> 'not_canceled'
      )
  ), candidates as materialized (
    select record.*
    from filtered_records record
    where transaction_cursor_created_at is null
      or (record.recorded_at, record.transaction_id) < (
        transaction_cursor_created_at,
        transaction_cursor_id
      )
    order by record.recorded_at desc, record.transaction_id desc
    limit transaction_page_size + 1
  ), visible_records as materialized (
    select record.*
    from candidates record
    order by record.recorded_at desc, record.transaction_id desc
    limit transaction_page_size
  )
  select
    coalesce(
      pg_catalog.array_agg(
        row(
          record.transaction_id,
          record.church_id,
          record.donor_name,
          record.fund_id,
          record.fund_name,
          record.campaign_id,
          record.campaign_name,
          record.recorded_at,
          record.frequency,
          record.recurring_status,
          record.amount_minor,
          record.currency,
          record.processing_fee_minor,
          record.refunded_amount_minor,
          record.net_amount_minor,
          record.payment_method_brand,
          record.payment_method_last4,
          record.payment_status,
          record.cancellation_state
        )::public.church_transaction_record
        order by record.recorded_at desc, record.transaction_id desc
      ),
      array[]::public.church_transaction_record[]
    ),
    (select count(*) > transaction_page_size from candidates),
    (
      select last_record.recorded_at
      from visible_records last_record
      order by last_record.recorded_at asc, last_record.transaction_id asc
      limit 1
    ),
    (
      select last_record.transaction_id
      from visible_records last_record
      order by last_record.recorded_at asc, last_record.transaction_id asc
      limit 1
    )
  into
    result_page.transactions,
    result_page.has_more,
    result_page.next_cursor_created_at,
    result_page.next_cursor_transaction_id
  from visible_records record;

  if not result_page.has_more then
    result_page.next_cursor_created_at := null;
    result_page.next_cursor_transaction_id := null;
  end if;

  return result_page;
end;
$$;

comment on function public.get_church_transaction_page(
  uuid,
  integer,
  timestamptz,
  uuid,
  date,
  date,
  text,
  bigint,
  bigint,
  uuid,
  text,
  text,
  public.donation_status,
  text
) is
  'Returns a minimum, keyset-paginated transaction projection and fund filters for one authorized church. Recurring-plan cancellation never rewrites historical payment status.';

revoke all privileges on type
  public.church_transaction_record,
  public.church_transaction_fund_option,
  public.church_transaction_page
from public, anon, authenticated, service_role;

grant usage on type
  public.church_transaction_record,
  public.church_transaction_fund_option,
  public.church_transaction_page
to authenticated;

revoke all privileges on function public.get_church_transaction_page(
  uuid,
  integer,
  timestamptz,
  uuid,
  date,
  date,
  text,
  bigint,
  bigint,
  uuid,
  text,
  text,
  public.donation_status,
  text
)
from public, anon, authenticated, service_role;

grant execute on function public.get_church_transaction_page(
  uuid,
  integer,
  timestamptz,
  uuid,
  date,
  date,
  text,
  bigint,
  bigint,
  uuid,
  text,
  text,
  public.donation_status,
  text
)
to authenticated;

commit;
