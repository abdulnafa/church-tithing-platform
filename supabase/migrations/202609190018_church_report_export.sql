begin;

-- P21 exports a bounded current-ledger snapshot for one authorized church.
-- It contains only post-capture gifts and deliberately excludes donor contact
-- details, messages, provider identifiers, checkout/webhook data, and prayer
-- request data. Monetary values are text so the server can serialize the full
-- PostgreSQL bigint range without JavaScript precision loss.

create type public.church_report_period as enum (
  'last_7_days',
  'month',
  'year',
  'all'
);

create type public.church_report_export_record as (
  transaction_id uuid,
  donated_at timestamptz,
  donor_name text,
  fund_name text,
  campaign_name text,
  source public.donation_source,
  frequency text,
  recurring_status text,
  gross_amount_minor text,
  currency text,
  processing_fee_minor text,
  refunded_amount_minor text,
  recorded_net_amount_minor text,
  payment_method_brand text,
  payment_method_last4 text,
  payment_status public.donation_status
);

create type public.church_report_export_result as (
  church_id uuid,
  church_slug text,
  church_timezone text,
  report_period public.church_report_period,
  report_as_of_date date,
  period_start_date date,
  period_end_date date,
  transactions public.church_report_export_record[]
);

create index donations_church_report_cursor_idx
  on public.donations (church_id, donated_at desc, id desc)
  where donated_at is not null
    and status in (
      'succeeded',
      'partially_refunded',
      'refunded',
      'disputed'
    );

create unique index audit_logs_report_export_request_unique
  on public.audit_logs (church_id, actor_user_id, request_id)
  where action_code = 'report_exported'
    and request_id is not null;

create or replace function public.export_church_giving_report(
  target_church_id uuid,
  report_request_id uuid,
  selected_period public.church_report_period default 'all',
  selected_as_of_date date default null
)
returns public.church_report_export_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  selected_slug text;
  selected_timezone text;
  resolved_as_of_date date;
  resolved_start_date date;
  start_at timestamptz;
  end_before timestamptz;
  export_count integer;
  export_audit_id bigint;
  result_export public.church_report_export_result;
begin
  request_user_id := (select auth.uid());

  if request_user_id is null
    or target_church_id is null
    or report_request_id is null
    or selected_period is null
    or not (select public.has_church_permission(
      target_church_id,
      'financial_read'
    ))
    or not (select public.has_church_permission(
      target_church_id,
      'reports_read'
    ))
    or not (select public.has_church_permission(
      target_church_id,
      'reports_export'
    ))
  then
    raise exception using
      errcode = '42501',
      message = 'CHURCH_REPORT_EXPORT_FORBIDDEN';
  end if;

  select church.slug, church.timezone
  into selected_slug, selected_timezone
  from public.churches church
  where church.id = target_church_id
    and church.status in ('active', 'onboarding');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'CHURCH_REPORT_EXPORT_FORBIDDEN';
  end if;

  if selected_as_of_date is not null and (
      selected_as_of_date < date '2000-01-01'
      or selected_as_of_date > date '2100-12-31'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_REPORT_EXPORT_INVALID_AS_OF_DATE';
  end if;

  resolved_as_of_date := coalesce(
    selected_as_of_date,
    (pg_catalog.statement_timestamp() at time zone selected_timezone)::date
  );

  resolved_start_date := case selected_period
    when 'last_7_days' then resolved_as_of_date - 6
    when 'month' then pg_catalog.date_trunc(
      'month',
      resolved_as_of_date::timestamp without time zone
    )::date
    when 'year' then pg_catalog.make_date(
      extract(year from resolved_as_of_date)::integer,
      1,
      1
    )
    when 'all' then null
  end;

  start_at := case
    when resolved_start_date is null then null
    else resolved_start_date::timestamp without time zone
      at time zone selected_timezone
  end;
  end_before := (resolved_as_of_date + 1)::timestamp without time zone
    at time zone selected_timezone;

  result_export.church_id := target_church_id;
  result_export.church_slug := selected_slug;
  result_export.church_timezone := selected_timezone;
  result_export.report_period := selected_period;
  result_export.report_as_of_date := resolved_as_of_date;
  result_export.period_start_date := resolved_start_date;
  result_export.period_end_date := resolved_as_of_date;

  with candidates as materialized (
    select
      donation.id as transaction_id,
      donation.donated_at,
      coalesce(
        public.canonicalize_public_display_name(
          donation.donor_display_name
        ),
        'Anonymous donor'
      ) as donor_name,
      coalesce(
        public.canonicalize_public_display_name(fund.name),
        'Unnamed fund'
      ) as fund_name,
      case
        when campaign.id is null then null
        else coalesce(
          public.canonicalize_public_display_name(campaign.name),
          'Unnamed campaign'
        )
      end as campaign_name,
      donation.source,
      recurring.frequency::text as frequency,
      recurring.status::text as recurring_status,
      donation.amount_minor::text as gross_amount_minor,
      donation.currency,
      donation.processing_fee_minor::text as processing_fee_minor,
      donation.refunded_amount_minor::text as refunded_amount_minor,
      donation.net_amount_minor::text as recorded_net_amount_minor,
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
      donation.status as payment_status
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
      and donation.status in (
        'succeeded',
        'partially_refunded',
        'refunded',
        'disputed'
      )
      and donation.donated_at is not null
      and (
        start_at is null
        or donation.donated_at >= start_at
      )
      and donation.donated_at < end_before
    order by donation.donated_at desc, donation.id desc
    limit 10001
  )
  select
    pg_catalog.count(*)::integer,
    coalesce(
      pg_catalog.array_agg(
        row(
          record.transaction_id,
          record.donated_at,
          record.donor_name,
          record.fund_name,
          record.campaign_name,
          record.source,
          record.frequency,
          record.recurring_status,
          record.gross_amount_minor,
          record.currency,
          record.processing_fee_minor,
          record.refunded_amount_minor,
          record.recorded_net_amount_minor,
          record.payment_method_brand,
          record.payment_method_last4,
          record.payment_status
        )::public.church_report_export_record
        order by record.donated_at desc, record.transaction_id desc
      ),
      array[]::public.church_report_export_record[]
    )
  into export_count, result_export.transactions
  from candidates record;

  if export_count > 10000 then
    raise exception using
      errcode = '54000',
      message = 'CHURCH_REPORT_EXPORT_TOO_LARGE';
  end if;

  select audit.id
  into export_audit_id
  from public.audit_logs audit
  where audit.church_id = target_church_id
    and audit.actor_user_id = request_user_id
    and audit.action_code = 'report_exported'
    and audit.request_id = report_request_id::text;

  if export_audit_id is null then
    begin
      export_audit_id := public.append_audit_event(
        target_church_id => target_church_id,
        event_actor_type => 'user',
        event_action => 'report_exported',
        event_entity => 'report',
        event_entity_id => report_request_id::text,
        event_actor_user_id => request_user_id,
        event_request_id => report_request_id::text,
        event_sanitized_changes => pg_catalog.jsonb_build_object(
          'report_type', 'giving_' || selected_period::text,
          'format', 'csv',
          'row_count', export_count
        )
      );
    exception when unique_violation then
      select audit.id
      into export_audit_id
      from public.audit_logs audit
      where audit.church_id = target_church_id
        and audit.actor_user_id = request_user_id
        and audit.action_code = 'report_exported'
        and audit.request_id = report_request_id::text;
    end;
  end if;

  if export_audit_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'CHURCH_REPORT_EXPORT_AUDIT_FAILED';
  end if;

  return result_export;
end;
$$;

comment on function public.export_church_giving_report(
  uuid,
  uuid,
  public.church_report_period,
  date
) is
  'Returns and audits one bounded CSV source snapshot of post-capture gifts for an authorized church. Periods use donated_at and church-local half-open boundaries; currencies remain on individual rows.';

revoke all privileges on type
  public.church_report_period,
  public.church_report_export_record,
  public.church_report_export_result
from public, anon, authenticated, service_role;

grant usage on type
  public.church_report_period,
  public.church_report_export_record,
  public.church_report_export_result
to authenticated;

revoke all privileges on function public.export_church_giving_report(
  uuid,
  uuid,
  public.church_report_period,
  date
)
from public, anon, authenticated, service_role;

grant execute on function public.export_church_giving_report(
  uuid,
  uuid,
  public.church_report_period,
  date
)
to authenticated;

commit;
