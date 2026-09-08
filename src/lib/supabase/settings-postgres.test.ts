import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "10000000-0000-4000-8000-000000000901",
  otherOwner: "10000000-0000-4000-8000-000000000902",
  staff: "10000000-0000-4000-8000-000000000903",
  inactiveOwner: "10000000-0000-4000-8000-000000000904",
  superAdmin: "10000000-0000-4000-8000-000000000905",
} as const;

const churches = {
  primary: "20000000-0000-4000-8000-000000000901",
  other: "20000000-0000-4000-8000-000000000902",
  suspended: "20000000-0000-4000-8000-000000000903",
} as const;

const requests = {
  profile: "30000000-0000-4000-8000-000000000901",
  firstLogo: "30000000-0000-4000-8000-000000000902",
  secondLogo: "30000000-0000-4000-8000-000000000903",
  noChange: "30000000-0000-4000-8000-000000000904",
  invalid: "30000000-0000-4000-8000-000000000905",
  forcedFailure: "30000000-0000-4000-8000-000000000906",
} as const;

const migrationFiles = [
  "202608180001_initial_schema.sql",
  "202609050001_harden_active_profile_authorization.sql",
  "202609050002_staff_permissions_and_audit_foundation.sql",
  "202609050003_provision_church_rpc.sql",
  "202609050004_church_settings_and_logo_storage.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type SettingsInput = {
  requestId: string | null;
  churchId: string;
  expectedRevision: number | null;
  displayName: string | null;
  legalName: string | null;
  supportEmail: string | null;
  timezone: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  thankYouMessage: string | null;
  logoAction: string | null;
  logoPath: string | null;
};

type SettingsResult = {
  church_id: string;
  settings_revision: number;
  logo_storage_path: string | null;
  logo_cleanup_path: string | null;
  logo_cleanup_status: "not_required" | "pending" | "completed";
  replayed: boolean;
};

const baseInput: SettingsInput = {
  requestId: requests.profile,
  churchId: churches.primary,
  expectedRevision: 0,
  displayName: "  Harbour   Grace  ",
  legalName: "  Harbour   Grace Church Inc.  ",
  supportEmail: "  GIVING@EXAMPLE.TEST ",
  timezone: " America/Barbados ",
  primaryColor: " #1a2b3c ",
  secondaryColor: " #DDEEFF ",
  thankYouMessage: "  Thank you!\nGod bless.  ",
  logoAction: "keep",
  logoPath: null,
};

const db = new PGlite();

function sqlLiteral(value: string | null) {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function updateSettingsSql(input: SettingsInput) {
  return `select * from public.update_church_settings(
    settings_request_id => ${sqlLiteral(input.requestId)}::uuid,
    target_church_id => '${input.churchId}'::uuid,
    expected_settings_revision => ${input.expectedRevision ?? "null"}::bigint,
    church_display_name => ${sqlLiteral(input.displayName)},
    church_legal_name => ${sqlLiteral(input.legalName)},
    church_support_email => ${sqlLiteral(input.supportEmail)},
    church_timezone => ${sqlLiteral(input.timezone)},
    church_primary_color => ${sqlLiteral(input.primaryColor)},
    church_secondary_color => ${sqlLiteral(input.secondaryColor)},
    church_thank_you_message => ${sqlLiteral(input.thankYouMessage)},
    church_logo_action => ${sqlLiteral(input.logoAction)},
    church_logo_storage_path => ${sqlLiteral(input.logoPath)}
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

async function uploadLogo(
  userId: string,
  path: string,
  metadata = { mimetype: "image/webp", size: 120_000 },
) {
  return asAuthenticated<{ name: string }>(
    userId,
    `insert into storage.objects (bucket_id, name, owner_id, metadata)
     values (
       'church-logos',
       '${path}',
       '${userId}',
       '${JSON.stringify(metadata)}'::jsonb
     ) returning name;`,
    true,
  );
}

describe("P09 church settings and logo storage behavior in PostgreSQL", () => {
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
      returns uuid language sql stable set search_path = '' as $$
        select nullif(
          pg_catalog.current_setting('request.jwt.claim.sub', true),
          ''
        )::uuid;
      $$;

      create schema storage;
      create table storage.buckets (
        id text primary key,
        name text not null unique,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text not null references storage.buckets(id),
        name text not null,
        owner_id text,
        metadata jsonb,
        constraint storage_objects_bucket_name_unique unique (bucket_id, name)
      );
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated, service_role;
      grant select, insert, update, delete on storage.objects
        to anon, authenticated, service_role;
      grant select on storage.buckets to anon, authenticated, service_role;
    `);

    for (const migration of migrations) await db.exec(migration);

    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p09@example.test', now(), '{"display_name":"P09 Owner"}'),
        ('${users.otherOwner}', 'other-owner-p09@example.test', now(), '{"display_name":"P09 Other Owner"}'),
        ('${users.staff}', 'staff-p09@example.test', now(), '{"display_name":"P09 Staff"}'),
        ('${users.inactiveOwner}', 'inactive-owner-p09@example.test', now(), '{"display_name":"P09 Inactive"}'),
        ('${users.superAdmin}', 'super-p09@example.test', now(), '{"display_name":"P09 Super"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';
      insert into public.platform_admins (user_id, role, is_active)
      values ('${users.superAdmin}', 'super_admin', true);

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        primary_color, secondary_color, thank_you_message, support_email,
        activated_at
      ) values
        ('${churches.primary}', 'Harbour Grace Church', 'Harbour Grace Inc.',
         'p09-primary', 'active', 'BBD', 'America/Barbados', '#112233',
         '#445566', 'Thank you for giving.', 'office@example.test', now()),
        ('${churches.other}', 'Other Church', 'Other Church Inc.',
         'p09-other', 'onboarding', 'USD', 'America/Barbados', null,
         null, null, 'other@example.test', null),
        ('${churches.suspended}', 'Suspended Church', 'Suspended Church Inc.',
         'p09-suspended', 'suspended', 'USD', 'America/Barbados', null,
         null, null, 'suspended@example.test', now());

      insert into public.church_memberships (
        church_id, user_id, role, status, accepted_at
      ) values
        ('${churches.primary}', '${users.owner}', 'owner', 'active', now()),
        ('${churches.primary}', '${users.staff}', 'staff', 'active', now()),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active', now()),
        ('${churches.primary}', '${users.inactiveOwner}', 'owner', 'active', now()),
        ('${churches.suspended}', '${users.owner}', 'owner', 'active', now());
    `);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates the exact public WebP bucket and settings schema", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      bucket.public,
      bucket.file_size_limit,
      bucket.allowed_mime_types,
      (select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'churches'
          and column_name = 'settings_revision') as revision_default,
      (select relrowsecurity from pg_class
        where oid = 'public.church_settings_update_requests'::regclass) as rls,
      (select relforcerowsecurity from pg_class
        where oid = 'public.church_settings_update_requests'::regclass) as forced
    from storage.buckets bucket where bucket.id = 'church-logos';`);

    expect(result.rows[0]).toEqual({
      public: true,
      file_size_limit: 768000,
      allowed_mime_types: ["image/webp"],
      revision_default: "0",
      rls: true,
      forced: true,
    });
  });

  it("returns the complete owner settings snapshot and denies every other capacity", async () => {
    const owner = await asAuthenticated<Record<string, unknown>>(
      users.owner,
      `select * from public.get_church_settings('${churches.primary}');`,
    );
    expect(owner.rows[0]).toMatchObject({
      church_id: churches.primary,
      display_name: "Harbour Grace Church",
      legal_name: "Harbour Grace Inc.",
      slug: "p09-primary",
      status: "active",
      default_currency: "BBD",
      settings_revision: 0,
    });

    const onboardingOwner = await asAuthenticated<Record<string, unknown>>(
      users.otherOwner,
      `select * from public.get_church_settings('${churches.other}');`,
    );
    expect(onboardingOwner.rows[0]).toMatchObject({
      church_id: churches.other,
      status: "onboarding",
      settings_revision: 0,
    });

    for (const [userId, churchId] of [
      [users.staff, churches.primary],
      [users.otherOwner, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.superAdmin, churches.primary],
      [users.owner, churches.suspended],
    ]) {
      await expect(
        asAuthenticated(
          userId,
          `select * from public.get_church_settings('${churchId}');`,
        ),
      ).rejects.toThrow(/SETTINGS_FORBIDDEN/);
    }
    await expect(
      asRole("anon", `select * from public.get_church_settings('${churches.primary}');`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("canonically updates settings, increments revision, and audits only sorted keys", async () => {
    const update = await asAuthenticated<SettingsResult>(
      users.owner,
      updateSettingsSql(baseInput),
      true,
    );
    expect(update.rows[0]).toEqual({
      church_id: churches.primary,
      settings_revision: 1,
      logo_storage_path: null,
      logo_cleanup_path: null,
      logo_cleanup_status: "not_required",
      replayed: false,
    });

    const stored = await db.query<Record<string, unknown>>(`select
      church.name, church.legal_name, church.support_email, church.timezone,
      church.primary_color, church.secondary_color, church.thank_you_message,
      church.settings_revision, church.slug, church.default_currency, church.status,
      audit.actor_user_id, audit.actor_type, audit.actor_role_snapshot,
      audit.action_code, audit.entity_code, audit.sanitized_changes::text changes,
      request.payload_sha256
    from public.churches church
    join public.church_settings_update_requests request
      on request.church_id = church.id
    join public.audit_logs audit on audit.id = request.audit_log_id
    where church.id = '${churches.primary}';`);
    expect(stored.rows[0]).toMatchObject({
      name: "Harbour Grace",
      legal_name: "Harbour Grace Church Inc.",
      support_email: "giving@example.test",
      timezone: "America/Barbados",
      primary_color: "#1A2B3C",
      secondary_color: "#DDEEFF",
      thank_you_message: "Thank you!\nGod bless.",
      settings_revision: 1,
      slug: "p09-primary",
      default_currency: "BBD",
      status: "active",
      actor_user_id: users.owner,
      actor_type: "user",
      actor_role_snapshot: "owner",
      action_code: "church_settings_updated",
      entity_code: "church",
    });
    expect(JSON.parse(stored.rows[0]?.changes as string)).toEqual({
      setting_keys: [
        "legal_name",
        "name",
        "primary_color",
        "secondary_color",
        "support_email",
        "thank_you_message",
      ],
    });
    expect(stored.rows[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.changes).not.toMatch(/Harbour|giving@|God bless/i);
  });

  it("replays before revision validation and rejects changed reuse or stale new requests", async () => {
    const replay = await asAuthenticated<SettingsResult>(
      users.owner,
      updateSettingsSql(baseInput),
      true,
    );
    expect(replay.rows[0]).toMatchObject({ settings_revision: 1, replayed: true });

    await expect(
      asAuthenticated(
        users.owner,
        updateSettingsSql({ ...baseInput, displayName: "Changed reuse" }),
        true,
      ),
    ).rejects.toThrow(/SETTINGS_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        users.owner,
        updateSettingsSql({
          ...baseInput,
          requestId: requests.noChange,
          displayName: "Stale request",
        }),
        true,
      ),
    ).rejects.toThrow(/SETTINGS_REVISION_CONFLICT/);
  });

  it("rejects no-op requests without revision, ledger, or audit changes", async () => {
    const before = await db.query<Record<string, number>>(`select
      (select settings_revision from public.churches
        where id = '${churches.primary}')::integer revision,
      (select count(*) from public.church_settings_update_requests)::integer ledgers,
      (select count(*) from public.audit_logs
        where church_id = '${churches.primary}')::integer audits;`);
    await expect(
      asAuthenticated(
        users.owner,
        updateSettingsSql({
          ...baseInput,
          requestId: requests.noChange,
          expectedRevision: 1,
          displayName: "Harbour Grace",
          legalName: "Harbour Grace Church Inc.",
          supportEmail: "giving@example.test",
          primaryColor: "#1A2B3C",
          secondaryColor: "#DDEEFF",
          thankYouMessage: "Thank you!\nGod bless.",
        }),
        true,
      ),
    ).rejects.toThrow(/SETTINGS_NO_CHANGES/);
    const after = await db.query<Record<string, number>>(`select
      (select settings_revision from public.churches
        where id = '${churches.primary}')::integer revision,
      (select count(*) from public.church_settings_update_requests)::integer ledgers,
      (select count(*) from public.audit_logs
        where church_id = '${churches.primary}')::integer audits;`);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("enforces tenant-bound unique WebP uploads and denies Storage overwrite", async () => {
    const path = `${churches.primary}/${requests.firstLogo}.webp`;
    expect((await uploadLogo(users.owner, path)).rows[0]?.name).toBe(path);

    await expect(
      uploadLogo(users.otherOwner, `${churches.primary}/${requests.invalid}.webp`),
    ).rejects.toThrow(/row-level security/i);
    const crossTenantMetadata = await asAuthenticated<{ name: string }>(
      users.otherOwner,
      `select name from storage.objects where bucket_id = 'church-logos'
        and name = '${path}';`,
    );
    expect(crossTenantMetadata.rows).toHaveLength(0);
    const crossTenantDelete = await asAuthenticated<{ name: string }>(
      users.otherOwner,
      `delete from storage.objects where bucket_id = 'church-logos'
        and name = '${path}' returning name;`,
      true,
    );
    expect(crossTenantDelete.rows).toHaveLength(0);
    await expect(
      uploadLogo(users.owner, `${churches.primary}/${requests.invalid}.png`),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      uploadLogo(users.staff, `${churches.primary}/${requests.invalid}.webp`),
    ).rejects.toThrow(/row-level security/i);

    const overwrite = await asAuthenticated<{ name: string }>(
      users.owner,
      `update storage.objects set metadata = '{"mimetype":"image/webp","size":1}'
       where bucket_id = 'church-logos' and name = '${path}' returning name;`,
      true,
    );
    expect(overwrite.rows).toHaveLength(0);
    await expect(uploadLogo(users.owner, path)).rejects.toThrow(/duplicate key/i);
  });

  it("validates request-bound stored logos and protects the active path", async () => {
    const firstPath = `${churches.primary}/${requests.firstLogo}.webp`;
    const first = await asAuthenticated<SettingsResult>(
      users.owner,
      updateSettingsSql({
        ...baseInput,
        requestId: requests.firstLogo,
        expectedRevision: 1,
        displayName: "Harbour Grace with Logo",
        logoAction: "replace",
        logoPath: firstPath,
      }),
      true,
    );
    expect(first.rows[0]).toMatchObject({
      settings_revision: 2,
      logo_storage_path: firstPath,
      logo_cleanup_status: "not_required",
    });

    const activeDelete = await asAuthenticated<{ name: string }>(
      users.owner,
      `delete from storage.objects where bucket_id = 'church-logos'
        and name = '${firstPath}' returning name;`,
      true,
    );
    expect(activeDelete.rows).toHaveLength(0);

    for (const [path, metadata, expected] of [
      [`${churches.other}/${requests.invalid}.webp`, undefined, /SETTINGS_INVALID_LOGO_PATH/],
      [`${churches.primary}/${requests.invalid}.webp`, undefined, /SETTINGS_INVALID_LOGO_PATH/],
      [`${churches.primary}/${requests.secondLogo}.webp`, { mimetype: "image/png", size: 10 }, /SETTINGS_LOGO_OBJECT_NOT_READY/],
    ] as const) {
      if (metadata) await uploadLogo(users.owner, path, metadata);
      await expect(
        asAuthenticated(
          users.owner,
          updateSettingsSql({
            ...baseInput,
            requestId: requests.secondLogo,
            expectedRevision: 2,
            displayName: "Logo validation",
            logoAction: "replace",
            logoPath: path,
          }),
          true,
        ),
      ).rejects.toThrow(expected);
    }
  });

  it("switches logos, exposes durable cleanup, and acknowledges only after deletion", async () => {
    const oldPath = `${churches.primary}/${requests.firstLogo}.webp`;
    const newPath = `${churches.primary}/${requests.secondLogo}.webp`;
    await db.exec(`delete from storage.objects where name = '${newPath}';`);
    await uploadLogo(users.owner, newPath);

    const replaced = await asAuthenticated<SettingsResult>(
      users.owner,
      updateSettingsSql({
        ...baseInput,
        requestId: requests.secondLogo,
        expectedRevision: 2,
        displayName: "Harbour Grace New Logo",
        logoAction: "replace",
        logoPath: newPath,
      }),
      true,
    );
    expect(replaced.rows[0]).toMatchObject({
      settings_revision: 3,
      logo_storage_path: newPath,
      logo_cleanup_path: oldPath,
      logo_cleanup_status: "pending",
      replayed: false,
    });

    await expect(
      asAuthenticated(
        users.owner,
        `select public.complete_church_logo_cleanup(
          '${churches.primary}', '${requests.secondLogo}', '${oldPath}'
        );`,
        true,
      ),
    ).rejects.toThrow(/SETTINGS_CLEANUP_OBJECT_EXISTS/);

    const pending = await asAuthenticated<Record<string, unknown>>(
      users.owner,
      `select * from public.get_pending_church_logo_cleanups('${churches.primary}');`,
    );
    expect(pending.rows).toEqual([
      { settings_request_id: requests.secondLogo, logo_storage_path: oldPath },
    ]);

    const deleted = await asAuthenticated<{ name: string }>(
      users.owner,
      `delete from storage.objects where bucket_id = 'church-logos'
        and name = '${oldPath}' returning name;`,
      true,
    );
    expect(deleted.rows).toEqual([{ name: oldPath }]);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completed = await asAuthenticated<{ completed: boolean }>(
        users.owner,
        `select public.complete_church_logo_cleanup(
          '${churches.primary}', '${requests.secondLogo}', '${oldPath}'
        ) completed;`,
        true,
      );
      expect(completed.rows[0]?.completed).toBe(true);
    }
    const replay = await asAuthenticated<SettingsResult>(
      users.owner,
      updateSettingsSql({
        ...baseInput,
        requestId: requests.secondLogo,
        expectedRevision: 2,
        displayName: "Harbour Grace New Logo",
        logoAction: "replace",
        logoPath: newPath,
      }),
      true,
    );
    expect(replay.rows[0]).toMatchObject({
      settings_revision: 3,
      logo_cleanup_path: oldPath,
      logo_cleanup_status: "completed",
      replayed: true,
    });
  });

  it("validates every settings field and explicit logo action independently", async () => {
    const control = String.fromCharCode(1);
    const invalidCases: Array<[Partial<SettingsInput>, RegExp]> = [
      [{ requestId: null }, /SETTINGS_REQUEST_ID_REQUIRED/],
      [{ expectedRevision: null }, /SETTINGS_INVALID_EXPECTED_REVISION/],
      [{ expectedRevision: -1 }, /SETTINGS_INVALID_EXPECTED_REVISION/],
      [{ displayName: "x" }, /SETTINGS_INVALID_CHURCH_NAME/],
      [{ displayName: `Valid${control}Name` }, /SETTINGS_INVALID_CHURCH_NAME/],
      [{ legalName: "x" }, /SETTINGS_INVALID_LEGAL_NAME/],
      [{ legalName: `Valid${control}Legal` }, /SETTINGS_INVALID_LEGAL_NAME/],
      [{ supportEmail: "support@localhost" }, /SETTINGS_INVALID_SUPPORT_EMAIL/],
      [{ timezone: "Barbados/Imaginary" }, /SETTINGS_INVALID_TIMEZONE/],
      [{ primaryColor: "#12345G" }, /SETTINGS_INVALID_PRIMARY_COLOR/],
      [{ secondaryColor: "123456" }, /SETTINGS_INVALID_SECONDARY_COLOR/],
      [{ thankYouMessage: "x".repeat(501) }, /SETTINGS_INVALID_THANK_YOU_MESSAGE/],
      [{ thankYouMessage: `Thanks${control}` }, /SETTINGS_INVALID_THANK_YOU_MESSAGE/],
      [{ logoAction: "overwrite" }, /SETTINGS_INVALID_LOGO_ACTION/],
      [{ logoAction: "keep", logoPath: "unexpected" }, /SETTINGS_INVALID_LOGO_PATH/],
      [{ logoAction: "remove", logoPath: "unexpected" }, /SETTINGS_INVALID_LOGO_PATH/],
    ];

    for (const [override, expected] of invalidCases) {
      await expect(
        asAuthenticated(
          users.owner,
          updateSettingsSql({
            ...baseInput,
            requestId: requests.invalid,
            expectedRevision: 3,
            displayName: "Validation Change",
            ...override,
          }),
          true,
        ),
      ).rejects.toThrow(expected);
    }
  });

  it("returns a deterministic bounded cleanup batch when backlog exceeds 100", async () => {
    await db.exec("begin;");
    try {
      await db.exec(`
        with source as (
          select gen_random_uuid() request_id, item
          from generate_series(1, 101) item
        ), inserted_audits as (
          insert into public.audit_logs (
            church_id, actor_user_id, actor_type,
            actor_display_name_snapshot, actor_role_snapshot,
            action, action_code, entity_table, entity_code,
            entity_id, request_id, sanitized_changes
          )
          select
            '${churches.primary}', null, 'system', null, null,
            'church_settings_updated', 'church_settings_updated',
            'church', 'church', '${churches.primary}', request_id::text,
            '{"setting_keys":["name"]}'::jsonb
          from source
          returning id, request_id
        ), numbered as (
          select id, request_id::uuid,
            row_number() over (order by request_id) item
          from inserted_audits
        )
        insert into public.church_settings_update_requests (
          church_id, requested_by_user_id, request_id, payload_sha256,
          result_settings_revision, result_logo_storage_path,
          logo_cleanup_path, logo_cleanup_status, audit_log_id, created_at
        )
        select
          '${churches.primary}', '${users.owner}', request_id, repeat('b', 64),
          1000 + item, null,
          '${churches.primary}/' || request_id::text || '.webp',
          'pending', id, '2026-09-05 00:00:00+00'::timestamptz +
            item * interval '1 millisecond'
        from numbered;

        select set_config('request.jwt.claim.sub', '${users.owner}', true);
        select set_config(
          'request.jwt.claims',
          '{"sub":"${users.owner}","role":"authenticated"}',
          true
        );
        set local role authenticated;
      `);
      const batch = await db.query<{
        settings_request_id: string;
        logo_storage_path: string;
      }>(`select * from public.get_pending_church_logo_cleanups(
        '${churches.primary}'
      );`);
      expect(batch.rows).toHaveLength(100);
      expect(
        batch.rows.every((row) =>
          row.logo_storage_path.endsWith(`${row.settings_request_id}.webp`),
        ),
      ).toBe(true);
      expect(
        batch.rows.map((row) => row.settings_request_id),
      ).toEqual(
        [...batch.rows]
          .map((row) => row.settings_request_id)
          .sort((left, right) => left.localeCompare(right)),
      );
    } finally {
      await db.exec("rollback;");
    }
  });

  it("keeps the ledger private, constrained, and mutation-guarded", async () => {
    await expect(
      asAuthenticated(
        users.owner,
        "select * from public.church_settings_update_requests;",
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.church_settings_update_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.query(`update public.church_settings_update_requests
        set payload_sha256 = repeat('a', 64)
        where church_id = '${churches.primary}';`),
    ).rejects.toThrow(/SETTINGS_LEDGER_APPEND_ONLY/);
    await expect(
      db.query("truncate public.church_settings_update_requests;"),
    ).rejects.toThrow(/SETTINGS_LEDGER_APPEND_ONLY/);
  });

  it("narrows direct church reads and keeps tenant/status RLS in force", async () => {
    const grants = await db.query<Record<string, boolean>>(`select
      has_column_privilege('anon', 'public.churches', 'id', 'SELECT') anon_id,
      has_column_privilege('anon', 'public.churches', 'default_currency', 'SELECT') anon_currency,
      has_column_privilege('anon', 'public.churches', 'logo_url', 'SELECT') anon_legacy_logo,
      has_column_privilege('anon', 'public.churches', 'support_email', 'SELECT') anon_support,
      has_column_privilege('anon', 'public.churches', 'logo_storage_path', 'SELECT') anon_logo,
      has_column_privilege('authenticated', 'public.churches', 'status', 'SELECT') auth_status,
      has_column_privilege('authenticated', 'public.churches', 'legal_name', 'SELECT') auth_legal;`);
    expect(grants.rows[0]).toEqual({
      anon_id: true,
      anon_currency: false,
      anon_legacy_logo: false,
      anon_support: false,
      anon_logo: false,
      auth_status: true,
      auth_legal: false,
    });

    const anon = await asRole<Record<string, unknown>>(
      "anon",
      "select id, name, slug, status from public.churches order by id;",
    );
    expect(anon.rows.map((row) => row.id)).toEqual([churches.primary]);
    await expect(
      asRole("anon", "select legal_name from public.churches;"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("rolls back church, audit, and revision when the final ledger insert fails", async () => {
    await db.exec(`
      create function public.p09_force_late_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'P09_FORCED_LATE_FAILURE'; end;
      $$;
      create trigger p09_force_late_failure
      before insert on public.church_settings_update_requests
      for each row execute function public.p09_force_late_failure();
    `);
    const before = await db.query<Record<string, number>>(`select
      (select settings_revision from public.churches
        where id = '${churches.primary}')::integer revision,
      (select count(*) from public.audit_logs
        where church_id = '${churches.primary}')::integer audits;`);
    await expect(
      asAuthenticated(
        users.owner,
        updateSettingsSql({
          ...baseInput,
          requestId: requests.forcedFailure,
          expectedRevision: 3,
          displayName: "Must Roll Back",
        }),
        true,
      ),
    ).rejects.toThrow(/P09_FORCED_LATE_FAILURE/);
    const after = await db.query<Record<string, number>>(`select
      (select settings_revision from public.churches
        where id = '${churches.primary}')::integer revision,
      (select count(*) from public.audit_logs
        where church_id = '${churches.primary}')::integer audits;`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    await db.exec(`
      drop trigger p09_force_late_failure
        on public.church_settings_update_requests;
      drop function public.p09_force_late_failure();
    `);
  });
});
