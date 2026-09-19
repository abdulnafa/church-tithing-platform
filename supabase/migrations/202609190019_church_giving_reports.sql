begin;

-- P22 exposes only aggregate, current-ledger giving information for one
-- authorized church. Every monetary value and count is text so JavaScript can
-- preserve PostgreSQL bigint/numeric precision. Currencies are never combined.

create type public.church_giving_report_currency_summary as (
  currency text,
  gross_amount_minor text,
  processing_fee_minor text,
  refunded_amount_minor text,
  recorded_net_amount_minor text,
  gift_count text
);

create type public.church_giving_report_trend_point as (
  bucket_start date,
  currency text,
  gross_amount_minor text,
  processing_fee_minor text,
  refunded_amount_minor text,
  recorded_net_amount_minor text,
  gift_count text
);

create type public.church_giving_report_fund_summary as (
  fund_id uuid,
  fund_name text,
  currency text,
  gross_amount_minor text,
  processing_fee_minor text,
  refunded_amount_minor text,
  recorded_net_amount_minor text,
  gift_count text
);

create type public.church_giving_report_gift_type_summary as (
  gift_type text,
  currency text,
  gross_amount_minor text,
  processing_fee_minor text,
  refunded_amount_minor text,
  recorded_net_amount_minor text,
  gift_count text
);

create type public.church_giving_report_result as (
  church_id uuid,
  church_timezone text,
  report_period public.church_report_period,
  report_as_of_date date,
  period_start_date date,
  period_end_date date,
  currency_summaries public.church_giving_report_currency_summary[],
  trend_points public.church_giving_report_trend_point[],
  fund_summaries public.church_giving_report_fund_summary[],
  gift_type_summaries public.church_giving_report_gift_type_summary[]
);

create or replace function public.get_church_giving_report(
  target_church_id uuid,
  selected_period public.church_report_period default 'all',
  selected_as_of_date date default null
)
returns public.church_giving_report_result
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  selected_timezone text;
  resolved_as_of_date date;
  resolved_start_date date;
  start_at timestamptz;
  end_before timestamptz;
  result_report public.church_giving_report_result;
begin
  request_user_id := (select auth.uid());

  if request_user_id is null
    or target_church_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'financial_read'
    ))
    or not (select public.has_church_permission(
      target_church_id,
      'reports_read'
    ))
  then
    raise exception using
      errcode = '42501',
      message = 'CHURCH_GIVING_REPORT_FORBIDDEN';
  end if;

  if selected_period is null then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_GIVING_REPORT_INVALID_PERIOD';
  end if;

  select church.timezone
  into selected_timezone
  from public.churches church
  where church.id = target_church_id
    and church.status in ('active', 'onboarding');

  if not found then
    raise exception using
      errcode = '42501',
      message = 'CHURCH_GIVING_REPORT_FORBIDDEN';
  end if;

  if selected_as_of_date is not null and (
      selected_as_of_date < date '2000-01-01'
      or selected_as_of_date > date '2100-12-31'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CHURCH_GIVING_REPORT_INVALID_AS_OF_DATE';
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

  result_report.church_id := target_church_id;
  result_report.church_timezone := selected_timezone;
  result_report.report_period := selected_period;
  result_report.report_as_of_date := resolved_as_of_date;
  result_report.period_start_date := resolved_start_date;
  result_report.period_end_date := resolved_as_of_date;

  with eligible_gifts as materialized (
    select
      donation.id,
      donation.fund_id,
      coalesce(
        public.canonicalize_public_display_name(fund.name),
        'Unnamed fund'
      ) as fund_name,
      donation.currency,
      donation.amount_minor,
      donation.processing_fee_minor,
      donation.refunded_amount_minor,
      donation.net_amount_minor,
      case
        when donation.recurring_gift_id is null then 'one_time'
        else 'recurring'
      end as gift_type,
      case
        when selected_period in ('last_7_days', 'month')
          then (donation.donated_at at time zone selected_timezone)::date
        else pg_catalog.date_trunc(
          'month',
          donation.donated_at at time zone selected_timezone
        )::date
      end as bucket_start
    from public.donations donation
    join public.funds fund
      on fund.church_id = donation.church_id
      and fund.id = donation.fund_id
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
  )
  select
    coalesce(
      (
        select pg_catalog.array_agg(
          row(
            summary.currency,
            summary.gross_amount_minor,
            summary.processing_fee_minor,
            summary.refunded_amount_minor,
            summary.recorded_net_amount_minor,
            summary.gift_count
          )::public.church_giving_report_currency_summary
          order by summary.currency asc
        )
        from (
          select
            gift.currency,
            pg_catalog.sum(gift.amount_minor)::text
              as gross_amount_minor,
            pg_catalog.sum(gift.processing_fee_minor)::text
              as processing_fee_minor,
            pg_catalog.sum(gift.refunded_amount_minor)::text
              as refunded_amount_minor,
            pg_catalog.sum(gift.net_amount_minor)::text
              as recorded_net_amount_minor,
            pg_catalog.count(*)::text as gift_count
          from eligible_gifts gift
          group by gift.currency
        ) summary
      ),
      array[]::public.church_giving_report_currency_summary[]
    ),
    coalesce(
      (
        select pg_catalog.array_agg(
          row(
            trend.bucket_start,
            trend.currency,
            trend.gross_amount_minor,
            trend.processing_fee_minor,
            trend.refunded_amount_minor,
            trend.recorded_net_amount_minor,
            trend.gift_count
          )::public.church_giving_report_trend_point
          order by trend.bucket_start asc, trend.currency asc
        )
        from (
          select
            gift.bucket_start,
            gift.currency,
            pg_catalog.sum(gift.amount_minor)::text
              as gross_amount_minor,
            pg_catalog.sum(gift.processing_fee_minor)::text
              as processing_fee_minor,
            pg_catalog.sum(gift.refunded_amount_minor)::text
              as refunded_amount_minor,
            pg_catalog.sum(gift.net_amount_minor)::text
              as recorded_net_amount_minor,
            pg_catalog.count(*)::text as gift_count
          from eligible_gifts gift
          group by gift.bucket_start, gift.currency
        ) trend
      ),
      array[]::public.church_giving_report_trend_point[]
    ),
    coalesce(
      (
        select pg_catalog.array_agg(
          row(
            summary.fund_id,
            summary.fund_name,
            summary.currency,
            summary.gross_amount_minor,
            summary.processing_fee_minor,
            summary.refunded_amount_minor,
            summary.recorded_net_amount_minor,
            summary.gift_count
          )::public.church_giving_report_fund_summary
          order by
            summary.currency asc,
            summary.gross_amount_numeric desc,
            summary.fund_id asc
        )
        from (
          select
            gift.fund_id,
            gift.fund_name,
            gift.currency,
            pg_catalog.sum(gift.amount_minor) as gross_amount_numeric,
            pg_catalog.sum(gift.amount_minor)::text
              as gross_amount_minor,
            pg_catalog.sum(gift.processing_fee_minor)::text
              as processing_fee_minor,
            pg_catalog.sum(gift.refunded_amount_minor)::text
              as refunded_amount_minor,
            pg_catalog.sum(gift.net_amount_minor)::text
              as recorded_net_amount_minor,
            pg_catalog.count(*)::text as gift_count
          from eligible_gifts gift
          group by gift.fund_id, gift.fund_name, gift.currency
        ) summary
      ),
      array[]::public.church_giving_report_fund_summary[]
    ),
    coalesce(
      (
        select pg_catalog.array_agg(
          row(
            summary.gift_type,
            summary.currency,
            summary.gross_amount_minor,
            summary.processing_fee_minor,
            summary.refunded_amount_minor,
            summary.recorded_net_amount_minor,
            summary.gift_count
          )::public.church_giving_report_gift_type_summary
          order by
            summary.currency asc,
            case summary.gift_type
              when 'one_time' then 0
              else 1
            end asc
        )
        from (
          select
            gift.gift_type,
            gift.currency,
            pg_catalog.sum(gift.amount_minor)::text
              as gross_amount_minor,
            pg_catalog.sum(gift.processing_fee_minor)::text
              as processing_fee_minor,
            pg_catalog.sum(gift.refunded_amount_minor)::text
              as refunded_amount_minor,
            pg_catalog.sum(gift.net_amount_minor)::text
              as recorded_net_amount_minor,
            pg_catalog.count(*)::text as gift_count
          from eligible_gifts gift
          group by gift.gift_type, gift.currency
        ) summary
      ),
      array[]::public.church_giving_report_gift_type_summary[]
    )
  into
    result_report.currency_summaries,
    result_report.trend_points,
    result_report.fund_summaries,
    result_report.gift_type_summaries;

  return result_report;
end;
$$;

comment on function public.get_church_giving_report(
  uuid,
  public.church_report_period,
  date
) is
  'Returns exact current-ledger giving aggregates for an authorized church. Periods use donated_at and church-local half-open boundaries; currencies remain separate.';

revoke all privileges on type
  public.church_giving_report_currency_summary,
  public.church_giving_report_trend_point,
  public.church_giving_report_fund_summary,
  public.church_giving_report_gift_type_summary,
  public.church_giving_report_result
from public, anon, authenticated, service_role;

grant usage on type
  public.church_giving_report_currency_summary,
  public.church_giving_report_trend_point,
  public.church_giving_report_fund_summary,
  public.church_giving_report_gift_type_summary,
  public.church_giving_report_result
to authenticated;

revoke all privileges on function public.get_church_giving_report(
  uuid,
  public.church_report_period,
  date
)
from public, anon, authenticated, service_role;

grant execute on function public.get_church_giving_report(
  uuid,
  public.church_report_period,
  date
)
to authenticated;

commit;
