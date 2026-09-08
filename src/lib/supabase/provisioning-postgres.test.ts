import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  superAdmin: "00000000-0000-4000-8000-000000000901",
  support: "00000000-0000-4000-8000-000000000902",
  ordinary: "00000000-0000-4000-8000-000000000903",
  disabledSuperAdmin: "00000000-0000-4000-8000-000000000904",
  activeOwner: "00000000-0000-4000-8000-000000000905",
  unconfirmedOwner: "00000000-0000-4000-8000-000000000906",
  inactiveOwner: "00000000-0000-4000-8000-000000000907",
} as const;

const requests = {
  active: "00000000-0000-4000-8000-000000000911",
  invited: "00000000-0000-4000-8000-000000000912",
  unconfirmed: "00000000-0000-4000-8000-000000000913",
  inactive: "00000000-0000-4000-8000-000000000914",
  slugConflict: "00000000-0000-4000-8000-000000000915",
  forcedFailure: "00000000-0000-4000-8000-000000000916",
  unauthorized: "00000000-0000-4000-8000-000000000917",
} as const;

const migrationFiles = [
  "202608180001_initial_schema.sql",
  "202609050001_harden_active_profile_authorization.sql",
  "202609050002_staff_permissions_and_audit_foundation.sql",
  "202609050003_provision_church_rpc.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type ProvisioningInput = {
  requestId: string | null;
  displayName: string | null;
  legalName: string | null;
  slug: string | null;
  ownerEmail: string | null;
  supportEmail: string | null;
  currency: string | null;
  timezone: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  thankYouMessage: string | null;
};

type ProvisioningResult = {
  church_id: string;
  church_slug: string;
  owner_membership_id: string;
  owner_membership_status: "active" | "invited";
  default_fund_id: string;
  qr_short_code: string;
  replayed: boolean;
};

const baseInput: ProvisioningInput = {
  requestId: requests.active,
  displayName: "  Harbour   Grace  ",
  legalName: "  Harbour   Grace Church Inc.  ",
  slug: "harbour-grace-p08",
  ownerEmail: "  ACTIVE.OWNER@EXAMPLE.TEST ",
  supportEmail: "  GIVING@EXAMPLE.TEST ",
  currency: " usd ",
  timezone: " America/Barbados ",
  primaryColor: " #1a2b3c ",
  secondaryColor: "",
  thankYouMessage: "  Thank you!\nGod bless.  ",
};

const db = new PGlite();

function sqlLiteral(value: string | null) {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function provisionSql(input: ProvisioningInput) {
  return `select * from public.provision_church(
    provisioning_request_id => ${sqlLiteral(input.requestId)}::uuid,
    church_display_name => ${sqlLiteral(input.displayName)},
    church_legal_name => ${sqlLiteral(input.legalName)},
    church_slug => ${sqlLiteral(input.slug)},
    owner_email => ${sqlLiteral(input.ownerEmail)},
    church_support_email => ${sqlLiteral(input.supportEmail)},
    church_currency => ${sqlLiteral(input.currency)},
    church_timezone => ${sqlLiteral(input.timezone)},
    church_primary_color => ${sqlLiteral(input.primaryColor)},
    church_secondary_color => ${sqlLiteral(input.secondaryColor)},
    church_thank_you_message => ${sqlLiteral(input.thankYouMessage)}
  );`;
}

async function asAuthenticated<T extends Record<string, unknown>>(
  userId: string,
  sql: string,
  commit = false,
) {
  await db.exec("begin;");
  try {
    await db.exec(`
      select set_config('request.jwt.claim.sub', '${userId}', true);
      select set_config(
        'request.jwt.claims',
        '{"sub":"${userId}","role":"authenticated"}',
        true
      );
      set local role authenticated;
    `);
    const result = await db.query<T>(sql);
    await db.exec(commit ? "commit;" : "rollback;");
    return result;
  } catch (error) {
    await db.exec("rollback;");
    throw error;
  }
}

async function asRole<T extends Record<string, unknown>>(
  role: "anon" | "service_role",
  sql: string,
) {
  await db.exec("begin;");
  try {
    await db.exec(`set local role ${role};`);
    const result = await db.query<T>(sql);
    await db.exec("rollback;");
    return result;
  } catch (error) {
    await db.exec("rollback;");
    throw error;
  }
}

async function expectDatabaseError(sql: string, message: RegExp) {
  await db.exec("begin;");
  try {
    await expect(db.query(sql)).rejects.toThrow(message);
  } finally {
    await db.exec("rollback;");
  }
}

describe("P08 church provisioning behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await db.waitReady;
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;

      alter default privileges in schema public
        grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public
        grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema public
        grant all on functions to anon, authenticated, service_role;

      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        email_confirmed_at timestamptz,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );

      create function auth.uid()
      returns uuid
      language sql
      stable
      set search_path = ''
      as $$
        select nullif(
          pg_catalog.current_setting('request.jwt.claim.sub', true),
          ''
        )::uuid;
      $$;
    `);

    for (const migration of migrations) await db.exec(migration);

    await db.exec(`
      insert into auth.users (
        id, email, email_confirmed_at, raw_user_meta_data
      ) values
        ('${users.superAdmin}', 'super-p08@example.test', now(), '{"display_name":"P08 Super Admin"}'),
        ('${users.support}', 'support-p08@example.test', now(), '{"display_name":"P08 Support"}'),
        ('${users.ordinary}', 'ordinary-p08@example.test', now(), '{"display_name":"P08 Ordinary"}'),
        ('${users.disabledSuperAdmin}', 'disabled-super-p08@example.test', now(), '{"display_name":"P08 Disabled Super"}'),
        ('${users.activeOwner}', 'active.owner@example.test', now(), '{"display_name":"P08 Active Owner"}'),
        ('${users.unconfirmedOwner}', 'unconfirmed.owner@example.test', null, '{"display_name":"P08 Unconfirmed Owner"}'),
        ('${users.inactiveOwner}', 'inactive.owner@example.test', now(), '{"display_name":"P08 Inactive Owner"}');

      update public.profiles
      set is_active = false
      where id in ('${users.disabledSuperAdmin}', '${users.inactiveOwner}');

      insert into public.platform_admins (user_id, role, is_active)
      values
        ('${users.superAdmin}', 'super_admin', true),
        ('${users.support}', 'support', true),
        ('${users.disabledSuperAdmin}', 'super_admin', true);
    `);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates one canonical onboarding church with exact trigger children and audit evidence", async () => {
    const result = await asAuthenticated<ProvisioningResult>(
      users.superAdmin,
      provisionSql(baseInput),
      true,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      church_slug: "harbour-grace-p08",
      owner_membership_status: "active",
      replayed: false,
    });
    expect(result.rows[0]?.qr_short_code).toMatch(/^[a-z0-9_-]{8,64}$/);

    const stored = await db.query<Record<string, unknown>>(`select
      church.name,
      church.legal_name,
      church.slug,
      church.status,
      church.default_currency,
      church.timezone,
      church.primary_color,
      church.secondary_color,
      church.thank_you_message,
      church.support_email,
      church.public_settings::text as public_settings,
      church.logo_url,
      church.activated_at,
      church.created_by,
      (select count(*)::integer from public.funds fund
        where fund.church_id = church.id) as funds,
      (select count(*)::integer from public.qr_links qr
        where qr.church_id = church.id) as qr_links,
      (select count(*)::integer from public.church_memberships membership
        where membership.church_id = church.id) as memberships,
      (select count(*)::integer from public.audit_logs audit
        where audit.church_id = church.id) as audits,
      (select count(*)::integer from public.church_provisioning_requests request
        where request.church_id = church.id) as ledger_rows
    from public.churches church
    where church.id = '${result.rows[0]?.church_id}';`);

    expect(stored.rows[0]).toEqual({
      name: "Harbour Grace",
      legal_name: "Harbour Grace Church Inc.",
      slug: "harbour-grace-p08",
      status: "onboarding",
      default_currency: "USD",
      timezone: "America/Barbados",
      primary_color: "#1A2B3C",
      secondary_color: null,
      thank_you_message: "Thank you!\nGod bless.",
      support_email: "giving@example.test",
      public_settings: "{}",
      logo_url: null,
      activated_at: null,
      created_by: users.superAdmin,
      funds: 1,
      qr_links: 1,
      memberships: 1,
      audits: 1,
      ledger_rows: 1,
    });

    const child = await db.query<Record<string, unknown>>(`select
      membership.user_id,
      membership.invited_email,
      membership.role,
      membership.status,
      membership.accepted_at is not null as accepted,
      membership.invited_by,
      fund.name as fund_name,
      fund.slug as fund_slug,
      fund.status as fund_status,
      fund.is_default,
      qr.kind as qr_kind,
      qr.is_active as qr_active,
      qr.scan_count,
      audit.actor_user_id,
      audit.actor_type,
      audit.actor_display_name_snapshot,
      audit.actor_role_snapshot,
      audit.action_code,
      audit.entity_code,
      audit.sanitized_changes::text as sanitized_changes,
      request.payload_sha256,
      request.provisioning_status
    from public.church_provisioning_requests request
    join public.church_memberships membership
      on membership.id = request.owner_membership_id
    join public.funds fund on fund.id = request.default_fund_id
    join public.qr_links qr on qr.id = request.qr_link_id
    join public.audit_logs audit on audit.id = request.audit_log_id
    where request.church_id = '${result.rows[0]?.church_id}';`);

    expect(child.rows[0]).toMatchObject({
      user_id: users.activeOwner,
      invited_email: null,
      role: "owner",
      status: "active",
      accepted: true,
      invited_by: users.superAdmin,
      fund_name: "Tithes",
      fund_slug: "tithes",
      fund_status: "active",
      is_default: true,
      qr_kind: "church",
      qr_active: true,
      scan_count: 0,
      actor_user_id: users.superAdmin,
      actor_type: "support",
      actor_display_name_snapshot: "P08 Super Admin",
      actor_role_snapshot: "super_admin",
      action_code: "church_provisioned",
      entity_code: "church",
      provisioning_status: "completed",
    });
    expect(child.rows[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    const auditChanges = JSON.parse(
      child.rows[0]?.sanitized_changes as string,
    ) as Record<string, unknown>;
    expect(Object.keys(auditChanges).sort()).toEqual([
      "church_slug",
      "currency",
      "default_fund_id",
      "owner_membership_status",
      "qr_short_code",
    ]);
    expect(JSON.stringify(auditChanges)).not.toMatch(
      /Harbour Grace|active\.owner|giving@|Thank you/i,
    );

    const excluded = await db.query<Record<string, number>>(`select
      (select count(*)::integer from public.platform_subscriptions) as subscriptions,
      (select count(*)::integer from public.payment_provider_connections) as providers,
      (select count(*)::integer from public.email_events) as emails,
      (select count(*)::integer from auth.users) as auth_users;`);
    expect(excluded.rows[0]).toEqual({
      subscriptions: 0,
      providers: 0,
      emails: 0,
      auth_users: 7,
    });
  });

  it("replays the canonical payload exactly and rejects request conflicts", async () => {
    const countSql = `select
      (select count(*) from public.churches)
      + (select count(*) from public.audit_logs)
      + (select count(*) from public.church_provisioning_requests)
      as total;`;
    const before = await db.query<{ total: number }>(countSql);

    const replay = await asAuthenticated<ProvisioningResult>(
      users.superAdmin,
      provisionSql({
        ...baseInput,
        displayName: "Harbour Grace",
        legalName: "Harbour Grace Church Inc.",
        ownerEmail: "active.owner@example.test",
        supportEmail: "giving@example.test",
        currency: "USD",
        timezone: "America/Barbados",
        primaryColor: "#1A2B3C",
        secondaryColor: null,
        thankYouMessage: "Thank you!\nGod bless.",
      }),
      true,
    );
    expect(replay.rows[0]).toMatchObject({
      church_slug: "harbour-grace-p08",
      replayed: true,
    });

    const original = await db.query<ProvisioningResult>(`select
      church_id,
      church_slug,
      owner_membership_id,
      owner_membership_status,
      default_fund_id,
      qr_short_code,
      false as replayed
    from public.church_provisioning_requests
    where request_id = '${requests.active}';`);
    expect({ ...replay.rows[0], replayed: false }).toEqual(original.rows[0]);

    const after = await db.query<{ total: number }>(countSql);
    expect(after.rows[0]?.total).toBe(before.rows[0]?.total);

    await expect(
      asAuthenticated(
        users.superAdmin,
        provisionSql({
          ...baseInput,
          thankYouMessage: "A different canonical payload",
        }),
        true,
      ),
    ).rejects.toThrow(/PROVISION_IDEMPOTENCY_CONFLICT/);
  });

  it("creates invited owners for absent or unconfirmed accounts", async () => {
    for (const input of [
      {
        requestId: requests.invited,
        slug: "invited-owner-p08",
        ownerEmail: " NEW.OWNER@EXAMPLE.TEST ",
        expectedEmail: "new.owner@example.test",
      },
      {
        requestId: requests.unconfirmed,
        slug: "unconfirmed-owner-p08",
        ownerEmail: "unconfirmed.owner@example.test",
        expectedEmail: "unconfirmed.owner@example.test",
      },
    ]) {
      const provisioned = await asAuthenticated<ProvisioningResult>(
        users.superAdmin,
        provisionSql({
          ...baseInput,
          requestId: input.requestId,
          slug: input.slug,
          ownerEmail: input.ownerEmail,
        }),
        true,
      );
      expect(provisioned.rows[0]?.owner_membership_status).toBe("invited");

      const membership = await db.query<Record<string, unknown>>(`select
        user_id, invited_email, role, status, accepted_at
        from public.church_memberships
        where id = '${provisioned.rows[0]?.owner_membership_id}';`);
      expect(membership.rows[0]).toEqual({
        user_id: null,
        invited_email: input.expectedEmail,
        role: "owner",
        status: "invited",
        accepted_at: null,
      });
    }
  });

  it("rejects inactive owners and every invalid input without residue", async () => {
    await expect(
      asAuthenticated(
        users.superAdmin,
        provisionSql({
          ...baseInput,
          requestId: requests.inactive,
          slug: "inactive-owner-p08",
          ownerEmail: "inactive.owner@example.test",
        }),
        true,
      ),
    ).rejects.toThrow(/PROVISION_OWNER_PROFILE_INACTIVE/);

    const control = String.fromCharCode(1);
    const invalidCases: Array<[Partial<ProvisioningInput>, RegExp]> = [
      [{ requestId: null }, /PROVISION_REQUEST_ID_REQUIRED/],
      [{ displayName: "x" }, /PROVISION_INVALID_CHURCH_NAME/],
      [{ displayName: `Valid${control}Name` }, /PROVISION_INVALID_CHURCH_NAME/],
      [{ legalName: "x" }, /PROVISION_INVALID_LEGAL_NAME/],
      [{ legalName: `Valid${control}Legal` }, /PROVISION_INVALID_LEGAL_NAME/],
      [{ slug: "Uppercase-Slug" }, /PROVISION_INVALID_SLUG/],
      [{ ownerEmail: "owner@localhost" }, /PROVISION_INVALID_OWNER_EMAIL/],
      [{ supportEmail: null }, /PROVISION_INVALID_SUPPORT_EMAIL/],
      [{ supportEmail: "support@@example.test" }, /PROVISION_INVALID_SUPPORT_EMAIL/],
      [{ currency: "EUR" }, /PROVISION_INVALID_CURRENCY/],
      [{ timezone: "Barbados/Imaginary" }, /PROVISION_INVALID_TIMEZONE/],
      [{ primaryColor: "#12345G" }, /PROVISION_INVALID_PRIMARY_COLOR/],
      [{ secondaryColor: "123456" }, /PROVISION_INVALID_SECONDARY_COLOR/],
      [{ thankYouMessage: "x".repeat(501) }, /PROVISION_INVALID_THANK_YOU_MESSAGE/],
      [{ thankYouMessage: `Thanks${control}` }, /PROVISION_INVALID_THANK_YOU_MESSAGE/],
    ];

    for (const [override, message] of invalidCases) {
      await expect(
        asAuthenticated(
          users.superAdmin,
          provisionSql({ ...baseInput, ...override }),
          true,
        ),
      ).rejects.toThrow(message);
    }

    const residue = await db.query<{ count: number }>(`select count(*)::integer
      as count from public.churches
      where slug = 'inactive-owner-p08';`);
    expect(residue.rows[0]?.count).toBe(0);
  });

  it("rejects duplicate slugs and every unauthorized caller", async () => {
    await expect(
      asAuthenticated(
        users.superAdmin,
        provisionSql({
          ...baseInput,
          requestId: requests.slugConflict,
        }),
        true,
      ),
    ).rejects.toThrow(/PROVISION_SLUG_UNAVAILABLE/);

    for (const userId of [
      users.ordinary,
      users.support,
      users.disabledSuperAdmin,
    ]) {
      await expect(
        asAuthenticated(
          userId,
          provisionSql({
            ...baseInput,
            requestId: requests.unauthorized,
            slug: `denied-${userId.slice(-3)}`,
          }),
          true,
        ),
      ).rejects.toThrow(/PROVISION_FORBIDDEN/);
    }

    await expect(
      asRole("anon", provisionSql(baseInput)),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps the ledger private, RLS-protected, and append-only", async () => {
    await expect(
      asAuthenticated(
        users.superAdmin,
        "select * from public.church_provisioning_requests;",
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.church_provisioning_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(
        users.superAdmin,
        `insert into public.church_provisioning_requests (
          requested_by_user_id, request_id, payload_sha256, church_id,
          church_slug, owner_membership_id, owner_membership_status,
          default_fund_id, qr_link_id, qr_short_code, audit_log_id
        ) values (
          '${users.superAdmin}', gen_random_uuid(), repeat('a', 64),
          '${users.superAdmin}', 'forged', gen_random_uuid(), 'active',
          gen_random_uuid(), gen_random_uuid(), 'forgedcode', 1
        );`,
      ),
    ).rejects.toThrow(/permission denied/i);

    await expectDatabaseError(
      `update public.church_provisioning_requests
       set provisioning_status = 'completed'
       where request_id = '${requests.active}';`,
      /PROVISION_LEDGER_APPEND_ONLY/,
    );
    await expectDatabaseError(
      "truncate public.church_provisioning_requests;",
      /PROVISION_LEDGER_APPEND_ONLY/,
    );

    const catalog = await db.query<Record<string, unknown>>(`select
      relation.relrowsecurity as rls_enabled,
      relation.relforcerowsecurity as rls_forced,
      (select count(*)::integer from pg_policies
        where schemaname = 'public'
          and tablename = 'church_provisioning_requests') as policies,
      has_table_privilege(
        'authenticated', 'public.church_provisioning_requests', 'SELECT'
      ) as auth_select,
      has_table_privilege(
        'service_role', 'public.church_provisioning_requests', 'SELECT'
      ) as service_select,
      has_function_privilege(
        'authenticated',
        'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE'
      ) as auth_execute,
      has_function_privilege(
        'anon',
        'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)',
        'EXECUTE'
      ) as anon_execute,
      procedure.prosecdef as security_definer,
      procedure.proconfig @> array['search_path=""'] as empty_search_path
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join pg_proc procedure
    join pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and relation.relname = 'church_provisioning_requests'
      and procedure_namespace.nspname = 'public'
      and procedure.proname = 'provision_church';`);
    expect(catalog.rows[0]).toEqual({
      rls_enabled: true,
      rls_forced: true,
      policies: 0,
      auth_select: false,
      service_select: false,
      auth_execute: true,
      anon_execute: false,
      security_definer: true,
      empty_search_path: true,
    });
  });

  it("hides onboarding churches and trigger children from anonymous readers", async () => {
    const result = await asRole<Record<string, number>>("anon", `select
      (select count(*)::integer from public.churches) as churches,
      (select count(*)::integer from public.funds) as funds,
      (select count(*)::integer from public.qr_links) as qr_links;`);
    expect(result.rows[0]).toEqual({ churches: 0, funds: 0, qr_links: 0 });
  });

  it("preserves the result snapshot without blocking owner Auth deletion", async () => {
    const before = await db.query<{
      owner_membership_id: string;
      owner_membership_status: string;
    }>(`select owner_membership_id, owner_membership_status
      from public.church_provisioning_requests
      where request_id = '${requests.active}';`);

    await db.exec(`delete from auth.users where id = '${users.activeOwner}';`);

    const after = await db.query<Record<string, unknown>>(`select
      request.owner_membership_id,
      request.owner_membership_status,
      (select count(*)::integer from public.church_memberships membership
        where membership.id = request.owner_membership_id) as live_memberships
      from public.church_provisioning_requests request
      where request.request_id = '${requests.active}';`);
    expect(after.rows[0]).toEqual({
      ...before.rows[0],
      live_memberships: 0,
    });

    const replay = await asAuthenticated<ProvisioningResult>(
      users.superAdmin,
      provisionSql(baseInput),
    );
    expect(replay.rows[0]).toMatchObject({
      owner_membership_id: before.rows[0]?.owner_membership_id,
      owner_membership_status: "active",
      replayed: true,
    });
  });

  it("rolls back church, children, audit, and ledger after a late failure", async () => {
    const countSql = `select
      (select count(*)::integer from public.churches) as churches,
      (select count(*)::integer from public.funds) as funds,
      (select count(*)::integer from public.qr_links) as qr_links,
      (select count(*)::integer from public.church_memberships) as memberships,
      (select count(*)::integer from public.audit_logs) as audits,
      (select count(*)::integer from public.church_provisioning_requests)
        as ledger;`;
    const before = await db.query<Record<string, number>>(countSql);

    await db.exec(`
      create function public.p08_force_late_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        raise exception 'P08_FORCED_LATE_FAILURE';
      end;
      $$;
      create trigger p08_force_late_failure
      before insert on public.church_provisioning_requests
      for each row execute function public.p08_force_late_failure();
    `);
    try {
      await expect(
        asAuthenticated(
          users.superAdmin,
          provisionSql({
            ...baseInput,
            requestId: requests.forcedFailure,
            slug: "forced-failure-p08",
          }),
          true,
        ),
      ).rejects.toThrow(/P08_FORCED_LATE_FAILURE/);
    } finally {
      await db.exec(`
        drop trigger p08_force_late_failure
          on public.church_provisioning_requests;
        drop function public.p08_force_late_failure();
      `);
    }

    const after = await db.query<Record<string, number>>(countSql);
    expect(after.rows[0]).toEqual(before.rows[0]);
    const residue = await db.query<{ count: number }>(`select count(*)::integer
      as count from public.churches where slug = 'forced-failure-p08';`);
    expect(residue.rows[0]?.count).toBe(0);
  });
});
