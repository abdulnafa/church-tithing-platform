begin;

create extension if not exists pgtap with schema extensions;

-- P15 is deliberately conservative: a verified member receives a distinct
-- profile, and no same-email guest row or financial history is ever claimed.
-- Every fixture and mutation below is transaction-scoped by the final rollback.
select extensions.plan(128);

-- Catalog, schema, indexes, constraints, RLS, and ACLs (1-40).
select extensions.is((select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typnamespace='public'::regnamespace and t.typname='audit_action' and e.enumlabel='donor_profile_created'), 1::bigint, 'created audit action is installed');
select extensions.is((select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typnamespace='public'::regnamespace and t.typname='audit_action' and e.enumlabel='donor_profile_updated'), 1::bigint, 'updated audit action is installed');
select extensions.is((select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typnamespace='public'::regnamespace and t.typname='audit_entity' and e.enumlabel='donor'), 1::bigint, 'donor audit entity is installed');
select extensions.is((select is_nullable from information_schema.columns where table_schema='public' and table_name='donors' and column_name='display_name'), 'NO', 'donor display name is required');
select extensions.is((select is_nullable from information_schema.columns where table_schema='public' and table_name='donors' and column_name='email'), 'NO', 'donor email is required');
select extensions.is((select is_nullable from information_schema.columns where table_schema='public' and table_name='donors' and column_name='profile_revision'), 'NO', 'profile revision is required');
select extensions.ok((select column_default like '0%' from information_schema.columns where table_schema='public' and table_name='donors' and column_name='profile_revision'), 'profile revision starts at zero');
select extensions.is((select count(*) from information_schema.columns where table_schema='public' and table_name='donors' and column_name='phone'), 1::bigint, 'legacy phone remains internal');
select extensions.is((select count(*) from pg_indexes where schemaname='public' and indexname='donors_email_unique_idx'), 0::bigint, 'same-email unique index is removed');
select extensions.is((select count(*) from pg_indexes where schemaname='public' and indexname='donors_email_lookup_idx'), 1::bigint, 'non-unique tenant email lookup exists');
select extensions.is((select count(*) from pg_indexes where schemaname='public' and indexname='donors_auth_user_global_unique_idx'), 1::bigint, 'global linked-account uniqueness exists');
select extensions.is((select count(*) from pg_indexes where schemaname='public' and indexname='donors_auth_user_unique_idx'), 0::bigint, 'old per-church linked-account uniqueness is removed');
select extensions.is((select confdeltype::text from pg_constraint where conname='donors_auth_user_id_fkey' and conrelid='public.donors'::regclass), 'r', 'Auth deletion is restricted');
select extensions.is((select count(*) from pg_trigger where tgrelid='public.donors'::regclass and tgname='donors_keep_auth_identity' and not tgisinternal), 1::bigint, 'linked Auth identity has an immutable trigger');
select extensions.is((select count(*) from pg_constraint where conrelid='public.donors'::regclass and conname='donors_linked_member_not_anonymous'), 1::bigint, 'linked donors cannot be anonymous');
select extensions.is((select relrowsecurity from pg_class where oid='public.donor_profile_mutation_requests'::regclass), true, 'idempotency ledger enables RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.donor_profile_mutation_requests'::regclass), true, 'idempotency ledger forces RLS');
select extensions.is((select count(*) from pg_policies where schemaname='public' and tablename='donor_profile_mutation_requests'), 0::bigint, 'private ledger has no client policy');
select extensions.is(has_table_privilege('authenticated','public.donor_profile_mutation_requests','SELECT'), false, 'authenticated cannot read private ledger');
select extensions.is(has_table_privilege('service_role','public.donor_profile_mutation_requests','SELECT'), false, 'service role cannot read private ledger');
select extensions.is(has_function_privilege('authenticated','public.get_my_donor_profile(uuid)','EXECUTE'), true, 'authenticated can call own-profile read');
select extensions.is(has_function_privilege('anon','public.get_my_donor_profile(uuid)','EXECUTE'), false, 'anonymous cannot call own-profile read');
select extensions.is(has_function_privilege('authenticated','public.mutate_my_donor_profile(uuid,uuid,bigint,text)','EXECUTE'), true, 'authenticated can call own-profile mutation');
select extensions.is(has_function_privilege('anon','public.mutate_my_donor_profile(uuid,uuid,bigint,text)','EXECUTE'), false, 'anonymous cannot call own-profile mutation');
select extensions.is(has_function_privilege('authenticated','public.owns_donor(uuid)','EXECUTE'), true, 'authenticated can use hardened ownership helper');
select extensions.is(has_function_privilege('anon','public.owns_donor(uuid)','EXECUTE'), false, 'anonymous cannot use ownership helper');
select extensions.is(has_function_privilege('authenticated','public.canonicalize_donor_email(text)','EXECUTE'), false, 'authenticated cannot call internal email helper');
select extensions.is(has_function_privilege('service_role','public.is_valid_donor_email(text)','EXECUTE'), false, 'service role cannot call internal validation helper');
select extensions.is(has_column_privilege('authenticated','public.donors','id','SELECT'), true, 'authenticated may read donor identifier through RLS');
select extensions.is(has_column_privilege('authenticated','public.donors','display_name','SELECT'), false, 'direct donor name reads are denied');
select extensions.is(has_column_privilege('authenticated','public.donors','email','SELECT'), false, 'direct donor email reads are denied');
select extensions.is(has_column_privilege('authenticated','public.donors','phone','SELECT'), false, 'direct donor phone reads are denied');
select extensions.is(has_table_privilege('authenticated','public.donors','INSERT'), false, 'authenticated cannot insert donors directly');
select extensions.is(has_table_privilege('authenticated','public.donors','UPDATE'), false, 'authenticated cannot update donors directly');
select extensions.is(has_table_privilege('authenticated','public.donors','DELETE'), false, 'authenticated cannot delete donors directly');
select extensions.is((select count(*) from pg_policies where schemaname='public' and tablename='donors' and policyname='donors_permission_read' and qual like '%members_read%' and qual like '%owns_donor%'), 1::bigint, 'members-read policy preserves staff scope and gates own linked row');
select extensions.is((select count(*) from pg_policies where schemaname='public' and tablename='donors' and policyname='donors_read_own'), 1::bigint, 'self-only donor policy remains installed');
select extensions.is((select count(*) from pg_constraint where conrelid='public.donor_profile_mutation_requests'::regclass and conname='donor_profile_mutation_requests_donor_revision_unique'), 1::bigint, 'one ledger row represents each donor revision');
select extensions.is((select count(*) from pg_indexes where schemaname='public' and indexname='donor_profile_mutation_requests_donor_idx'), 0::bigint, 'redundant ledger donor index is absent');
select extensions.is((select count(*) from pg_trigger where tgrelid='public.donor_profile_mutation_requests'::regclass and tgname in ('donor_profile_mutation_requests_append_only','donor_profile_mutation_requests_no_truncate') and not tgisinternal), 2::bigint, 'ledger update delete and truncate guards exist');

-- Canonicalization and validation parity (41-49).
select extensions.is(public.canonicalize_donor_display_name(U&'  Mar\00EDa\00A0  Jordan  '), U&'Mar\00EDa Jordan', 'Unicode whitespace is trimmed and collapsed');
select extensions.is(public.donor_text_has_unsafe_formatting(U&'Mar\00EDa Jordan'), false, 'ordinary Unicode name is safe');
select extensions.is(public.donor_text_has_unsafe_formatting(E'Line\nBreak'), true, 'newlines are unsafe');
select extensions.is(public.donor_text_has_unsafe_formatting('A'||chr(133)||'B'), true, 'C1 controls are unsafe');
select extensions.is(public.donor_text_has_unsafe_formatting('A'||chr(8238)||'B'), true, 'bidi override is unsafe');
select extensions.is(public.canonicalize_donor_email(U&'\00A0Member.P15@Example.Test\FEFF'), 'member.p15@example.test', 'email canonicalization matches Unicode trim and lowercase');
select extensions.is(public.is_valid_donor_email('member.p15@example.test'), true, 'canonical email is valid');
select extensions.is(public.is_valid_donor_email('Member.P15@example.test'), false, 'noncanonical uppercase email is invalid');
select extensions.is(public.is_valid_donor_email('two..dots@example.test'), false, 'unsafe local-part dots are invalid');

-- Transaction-scoped identities and tenants.
insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001','member.p15@example.test',now(),'{"display_name":"P15 Member"}'),
  ('e1000000-0000-4000-8000-000000000002','other.p15@example.test',now(),'{"display_name":"P15 Other"}'),
  ('e1000000-0000-4000-8000-000000000003','unverified.p15@example.test',null,'{"display_name":"P15 Unverified"}'),
  ('e1000000-0000-4000-8000-000000000004','inactive.p15@example.test',now(),'{"display_name":"P15 Inactive"}'),
  ('e1000000-0000-4000-8000-000000000005','invalid-email',now(),'{"display_name":"P15 Invalid"}'),
  ('e1000000-0000-4000-8000-000000000006','staff.p15@example.test',now(),'{"display_name":"P15 Staff"}'),
  ('e1000000-0000-4000-8000-000000000007','suspended.p15@example.test',now(),'{"display_name":"P15 Suspended"}'),
  ('e1000000-0000-4000-8000-000000000008','dual.p15@example.test',null,'{"display_name":"P15 Dual Role"}');

update public.profiles set is_active=false where id='e1000000-0000-4000-8000-000000000004';

insert into public.churches (id,name,legal_name,slug,status,default_currency,timezone,support_email,activated_at,suspended_at) values
  ('e2000000-0000-4000-8000-000000000001','P15 Hosted Primary','P15 Hosted Primary Inc.','p15-hosted-primary','active','BBD','America/Barbados','primary.p15@example.test',now(),null),
  ('e2000000-0000-4000-8000-000000000002','P15 Hosted Other','P15 Hosted Other Inc.','p15-hosted-other','active','BBD','America/Barbados','other-church.p15@example.test',now(),null),
  ('e2000000-0000-4000-8000-000000000003','P15 Hosted Suspended','P15 Hosted Suspended Inc.','p15-hosted-suspended','suspended','BBD','America/Barbados','suspended-church.p15@example.test',now(),now());

insert into public.donors (id,church_id,auth_user_id,display_name,email,is_anonymous) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',null,'Prior Guest','member.p15@example.test',false),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','Other Member','other.p15@example.test',false),
  ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','Unverified Member','unverified.p15@example.test',false),
  ('e3000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005','Invalid Email Member','placeholder.p15@example.test',false),
  ('e3000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000007','Suspended Member','suspended.p15@example.test',false),
  ('e3000000-0000-4000-8000-000000000006','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','Dual Role Member','dual.p15@example.test',false);

insert into public.church_memberships (church_id,user_id,role,status,accepted_at) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','owner','active',now()),
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000008','finance_admin','active',now());

insert into public.donations (id,church_id,donor_id,fund_id,source,status,amount_minor,currency,donor_display_name,donor_email,donated_at) values
  ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',(select id from public.funds where church_id='e2000000-0000-4000-8000-000000000001' and is_default),'cash','succeeded',2500,'BBD','Prior Guest','member.p15@example.test',now()),
  ('e5000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000003',(select id from public.funds where church_id='e2000000-0000-4000-8000-000000000001' and is_default),'cash','succeeded',1000,'BBD','Unverified Member','unverified.p15@example.test',now()),
  ('e5000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000004',(select id from public.funds where church_id='e2000000-0000-4000-8000-000000000001' and is_default),'cash','succeeded',1000,'BBD','Invalid Email Member','placeholder.p15@example.test',now()),
  ('e5000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000005',(select id from public.funds where church_id='e2000000-0000-4000-8000-000000000003' and is_default),'cash','succeeded',1000,'BBD','Suspended Member','suspended.p15@example.test',now());

select extensions.throws_like($$insert into public.donors(church_id,auth_user_id,display_name,email,is_anonymous) values('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','Unsafe Linked','member.p15@example.test',true)$$, '%donors_linked_member_not_anonymous%', 'linked member cannot be marked anonymous');

-- Anonymous and ineligible callers fail closed (51-57).
set local role anon;
select extensions.throws_like($$select * from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')$$, '%permission denied%', 'anonymous cannot read a member profile');
select extensions.throws_like($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',0,'Member Name')$$, '%permission denied%', 'anonymous cannot mutate a member profile');
reset role;

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000003'; set local role authenticated;
select extensions.is((select count(*) from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 0::bigint, 'unverified caller reads no profile');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000004'; set local role authenticated;
select extensions.is((select count(*) from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 0::bigint, 'inactive caller reads no profile');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000005'; set local role authenticated;
select extensions.is((select count(*) from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 0::bigint, 'invalid-email caller reads no profile');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000007'; set local role authenticated;
select extensions.is((select count(*) from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000003')), 0::bigint, 'suspended-church caller reads no profile');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is((select count(*) from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 0::bigint, 'eligible caller starts without a linked profile');

-- Create, minimum read DTO, guest-history isolation, and audit (58-76).
select extensions.is((select operation||':'||profile_revision::text||':'||replayed::text from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',0,U&'  Mar\00EDa   Jordan  ')), 'created:0:false', 'mutation creates a distinct revision-zero profile');
select extensions.is((select count(*) from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 1::bigint, 'own-profile read returns one row');
select extensions.is((select display_name from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), U&'Mar\00EDa Jordan', 'read returns canonical display name');
select extensions.is((select email from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 'member.p15@example.test', 'read returns verified Auth email');
select extensions.is((select profile_revision from public.get_my_donor_profile('e2000000-0000-4000-8000-000000000001')), 0::bigint, 'created profile revision is zero');
select extensions.is((select count(id) from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'), 1::bigint, 'direct self metadata exposes only own linked row');
reset role;
select set_config(
  'p15.member_donor_id',
  (select id::text from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'),
  true
);

select extensions.is((select count(*) from public.donors where church_id='e2000000-0000-4000-8000-000000000001' and email='member.p15@example.test'), 2::bigint, 'guest and member same-email rows coexist');
select extensions.is((select auth_user_id from public.donors where id='e3000000-0000-4000-8000-000000000001'), null::uuid, 'guest row remains unlinked');
select extensions.is((select donor_id from public.donations where id='e5000000-0000-4000-8000-000000000001'), 'e3000000-0000-4000-8000-000000000001'::uuid, 'guest donation attribution is unchanged');
select extensions.is((select count(*) from public.donations where donor_id=(select id from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001')), 0::bigint, 'new member receives no historical guest donations');
select extensions.is((select count(*) from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 1::bigint, 'create writes one audit event');
select extensions.is((select action_code::text from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 'donor_profile_created', 'create audit action is finite');
select extensions.is((select entity_code::text from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 'donor', 'create audit entity is donor');
select extensions.is((select sanitized_changes from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), jsonb_build_object('donor_id',(select id from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'),'field_names',jsonb_build_array('display_name','email')), 'create audit stores identifiers and field names only');
select extensions.ok((select sanitized_changes::text !~* 'mar|member\.p15|@' from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 'audit JSON contains no donor PII');
select extensions.is((select actor_display_name_snapshot from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 'Registered donor', 'donor audit snapshot uses privacy-neutral label');
select extensions.is((select actor_role_snapshot from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 'member', 'donor audit snapshot uses bounded role');
select extensions.is((select count(*) from public.donor_profile_mutation_requests where request_id='e4000000-0000-4000-8000-000000000001'), 1::bigint, 'create writes one private ledger row');
select extensions.ok((select payload_sha256 ~ '^[0-9a-f]{64}$' from public.donor_profile_mutation_requests where request_id='e4000000-0000-4000-8000-000000000001'), 'ledger stores only an opaque request digest');

-- Exact replay, idempotency, CAS, validation, and tenant boundary (77-97).
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is((select operation||':'||profile_revision::text||':'||replayed::text from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',0,U&'Mar\00EDa Jordan')), 'created:0:true', 'exact retry replays the original result');
reset role;
select extensions.is((select count(*) from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000001'), 1::bigint, 'replay does not duplicate audit');
select extensions.is((select count(*) from public.donor_profile_mutation_requests where request_id='e4000000-0000-4000-8000-000000000001'), 1::bigint, 'replay does not duplicate ledger');

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',0,'Changed Replay')$$, '22023', 'DONOR_PROFILE_IDEMPOTENCY_CONFLICT', 'same request with different payload is rejected');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000002'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',0,U&'Mar\00EDa Jordan')$$, '22023', 'DONOR_PROFILE_IDEMPOTENCY_CONFLICT', 'same request from another caller is rejected');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is((select operation||':'||profile_revision::text||':'||replayed::text from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000002',0,U&'Mar\00EDa Clarke')), 'updated:1:false', 'exact CAS updates and increments revision');
reset role;
select extensions.is((select profile_revision from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'), 1::bigint, 'stored revision increments once');
select extensions.is((select display_name from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'), U&'Mar\00EDa Clarke', 'stored name is updated canonically');
select extensions.is((select sanitized_changes from public.audit_logs where request_id='e4000000-0000-4000-8000-000000000002'), jsonb_build_object('donor_id',(select id from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'),'field_names',jsonb_build_array('display_name')), 'update audit stores only changed field names');

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000003',0,'Stale Name')$$, '40001', 'DONOR_PROFILE_REVISION_CONFLICT', 'stale revision is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000004',1,U&'Mar\00EDa Clarke')$$, '22023', 'DONOR_PROFILE_NO_CHANGES', 'no-op update is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001',null,1,'Valid Name')$$, '22023', 'DONOR_PROFILE_INVALID_REQUEST_ID', 'null request identifier is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000005',null,'Valid Name')$$, '22023', 'DONOR_PROFILE_INVALID_EXPECTED_REVISION', 'null revision is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000006',1,'A')$$, '22023', 'DONOR_PROFILE_INVALID_DISPLAY_NAME', 'short display name is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000007',1,E'Line\nBreak')$$, '22023', 'DONOR_PROFILE_INVALID_DISPLAY_NAME', 'multiline display name is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000008',1,'Safe'||chr(8238)||'Name')$$, '22023', 'DONOR_PROFILE_INVALID_DISPLAY_NAME', 'bidi-formatted display name is rejected');
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000009',1,'Cross Church')$$, '42501', 'DONOR_PROFILE_FORBIDDEN', 'linked account cannot create a second-church donor');
reset role;

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000003'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000010',0,'Valid Name')$$, '42501', 'DONOR_PROFILE_FORBIDDEN', 'unverified identity cannot mutate');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000004'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000011',0,'Valid Name')$$, '42501', 'DONOR_PROFILE_FORBIDDEN', 'inactive profile cannot mutate');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000005'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000012',0,'Valid Name')$$, '42501', 'DONOR_PROFILE_FORBIDDEN', 'invalid Auth email cannot mutate');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000007'; set local role authenticated;
select extensions.throws_ok($$select * from public.mutate_my_donor_profile('e2000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000013',0,'Valid Name')$$, '42501', 'DONOR_PROFILE_FORBIDDEN', 'suspended church member cannot mutate');
reset role;

-- Hardened owns_donor and downstream financial RLS (98-114).
insert into public.donations (id,church_id,donor_id,fund_id,source,status,amount_minor,currency,donor_display_name,donor_email,donated_at)
values ('e5000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000001',(select id from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000001'),(select id from public.funds where church_id='e2000000-0000-4000-8000-000000000001' and is_default),'cash','succeeded',1500,'BBD','Member Snapshot','member.p15@example.test',now());

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is(public.owns_donor(current_setting('p15.member_donor_id')::uuid), true, 'eligible member owns exact linked donor');
select extensions.is(public.owns_donor('e3000000-0000-4000-8000-000000000002'), false, 'member does not own another donor');
select extensions.is((select count(id) from public.donations), 1::bigint, 'eligible member sees only own financial row');
reset role;

update auth.users set email_confirmed_at=null where id='e1000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is(public.owns_donor(current_setting('p15.member_donor_id')::uuid), false, 'confirmation removal invalidates ownership');
select extensions.is((select count(id) from public.donations), 0::bigint, 'confirmation removal hides financial rows');
reset role;
update auth.users set email_confirmed_at=now() where id='e1000000-0000-4000-8000-000000000001';

update auth.users set email='changed.p15@example.test' where id='e1000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is(public.owns_donor(current_setting('p15.member_donor_id')::uuid), false, 'Auth and donor email mismatch invalidates ownership');
select extensions.is((select count(id) from public.donations), 0::bigint, 'email mismatch hides financial rows');
reset role;
update auth.users set email='member.p15@example.test' where id='e1000000-0000-4000-8000-000000000001';

update public.churches set status='suspended',suspended_at=now() where id='e2000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is(public.owns_donor(current_setting('p15.member_donor_id')::uuid), false, 'church suspension invalidates ownership');
select extensions.is((select count(id) from public.donations), 0::bigint, 'church suspension hides financial rows');
reset role;
update public.churches set status='active',suspended_at=null where id='e2000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.is(public.owns_donor(current_setting('p15.member_donor_id')::uuid), true, 'restored eligibility restores ownership');
reset role;

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000003'; set local role authenticated;
select extensions.is(public.owns_donor('e3000000-0000-4000-8000-000000000003'), false, 'unverified linked identity does not own donor');
select extensions.is((select count(id) from public.donations), 0::bigint, 'unverified linked identity sees no financial rows');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000005'; set local role authenticated;
select extensions.is(public.owns_donor('e3000000-0000-4000-8000-000000000004'), false, 'invalid-email linked identity does not own donor');
select extensions.is((select count(id) from public.donations), 0::bigint, 'invalid-email linked identity sees no financial rows');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000007'; set local role authenticated;
select extensions.is(public.owns_donor('e3000000-0000-4000-8000-000000000005'), false, 'suspended-tenant linked identity does not own donor');
select extensions.is((select count(id) from public.donations), 0::bigint, 'suspended-tenant linked identity sees no financial rows');
reset role;
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000004'; set local role authenticated;
select extensions.is(public.owns_donor(current_setting('p15.member_donor_id')::uuid), false, 'inactive profile cannot own another donor');
reset role;

-- Direct access, dual-role regression, attribution, and append-only state (115-127).
set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000006'; set local role authenticated;
select extensions.is((select count(id) from public.donors), 6::bigint, 'members-read staff sees own-church donor identity rows');
select extensions.throws_like($$select display_name,email,phone from public.donors$$, '%permission denied%', 'staff cannot enumerate donor PII');
reset role;

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000008'; set local role authenticated;
select extensions.is((select count(id) from public.donors), 5::bigint, 'ineligible dual-role caller still sees other staff-authorized rows');
select extensions.is((select count(id) from public.donors where auth_user_id='e1000000-0000-4000-8000-000000000008'), 0::bigint, 'staff policy cannot expose ineligible caller own linked row');
reset role;

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001'; set local role authenticated;
select extensions.throws_like($$select display_name,email,phone from public.donors$$, '%permission denied%', 'member cannot bypass bounded profile DTO');
select extensions.throws_like($$update public.donors set display_name='Bypass' where auth_user_id='e1000000-0000-4000-8000-000000000001'$$, '%permission denied%', 'member cannot update donor directly');
select extensions.throws_like($$select * from public.donor_profile_mutation_requests$$, '%permission denied%', 'member cannot inspect replay ledger');
reset role;

set local role service_role;
select extensions.throws_like($$update public.donors set auth_user_id='e1000000-0000-4000-8000-000000000001' where id='e3000000-0000-4000-8000-000000000001'$$, '%permission denied%', 'service role cannot claim historical guest row');
reset role;

select extensions.throws_ok($$update public.donors set auth_user_id='e1000000-0000-4000-8000-000000000001' where id='e3000000-0000-4000-8000-000000000001'$$, '55000', 'DONOR_AUTH_IDENTITY_IMMUTABLE', 'database owner cannot silently reassign guest identity');
select extensions.throws_like($$delete from auth.users where id='e1000000-0000-4000-8000-000000000001'$$, '%foreign key constraint%', 'Auth deletion cannot silently orphan linked donor history');

set local "request.jwt.claim.sub"='e1000000-0000-4000-8000-000000000001';
select extensions.throws_like($$insert into public.audit_logs(church_id,actor_user_id,actor_type,action,action_code,entity_table,entity_code,entity_id,request_id,sanitized_changes) values('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','user','donor_profile_updated','donor_profile_updated','donor','donor','e3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000099',jsonb_build_object('donor_id','e3000000-0000-4000-8000-000000000001','field_names',jsonb_build_array('display_name')))$$, '%user audit actor has no active donor capacity%', 'donor audit actor cannot name an arbitrary donor');
select set_config('request.jwt.claim.sub','',true);

select extensions.throws_ok($$update public.donor_profile_mutation_requests set payload_sha256=repeat('a',64) where request_id='e4000000-0000-4000-8000-000000000001'$$, '55000', 'DONOR_PROFILE_LEDGER_APPEND_ONLY', 'ledger rows cannot be updated');
select extensions.throws_ok($$delete from public.donor_profile_mutation_requests where request_id='e4000000-0000-4000-8000-000000000001'$$, '55000', 'DONOR_PROFILE_LEDGER_APPEND_ONLY', 'ledger rows cannot be deleted');
select extensions.throws_ok($$truncate public.donor_profile_mutation_requests$$, '55000', 'DONOR_PROFILE_LEDGER_APPEND_ONLY', 'ledger cannot be truncated');

select * from extensions.finish();

rollback;
