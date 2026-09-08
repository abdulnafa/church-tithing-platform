begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('71000000-0000-4000-8000-000000001101','owner-p12-hosted@example.test',now(),'{"display_name":" P12   Owner "}'),
  ('71000000-0000-4000-8000-000000001102','owner-two-p12-hosted@example.test',now(),'{"display_name":"Second Owner"}'),
  ('71000000-0000-4000-8000-000000001103','finance-p12-hosted@example.test',now(),'{"display_name":"Finance"}'),
  ('71000000-0000-4000-8000-000000001104','staff-p12-hosted@example.test',now(),'{"display_name":"Staff"}'),
  ('71000000-0000-4000-8000-000000001105','suspended-p12-hosted@example.test',now(),'{"display_name":"Suspended"}'),
  ('71000000-0000-4000-8000-000000001106','other-owner-p12-hosted@example.test',now(),'{"display_name":"Other"}'),
  ('71000000-0000-4000-8000-000000001107','claim-p12-hosted@example.test',now(),'{"display_name":"Claimant"}'),
  ('71000000-0000-4000-8000-000000001108','unconfirmed-p12-hosted@example.test',null,'{"display_name":"Unconfirmed"}'),
  ('71000000-0000-4000-8000-000000001109','inactive-p12-hosted@example.test',now(),'{"display_name":"Inactive"}'),
  ('71000000-0000-4000-8000-000000001110','rehire-p12-hosted@example.test',now(),'{"display_name":"Rehire"}'),
  ('71000000-0000-4000-8000-000000001111','invited-owner-p12-hosted@example.test',now(),'{"display_name":"Invited Owner"}'),
  ('71000000-0000-4000-8000-000000001112','duplicate-p12-hosted@example.test',now(),'{"display_name":"Duplicate"}');

update public.profiles set is_active=false
where id='71000000-0000-4000-8000-000000001109';
update public.profiles set display_name=E'Unsafe\001Name'
where id='71000000-0000-4000-8000-000000001104';

insert into public.churches (
  id,name,legal_name,slug,status,default_currency,timezone,support_email,activated_at,suspended_at
) values
  ('72000000-0000-4000-8000-000000001101','P12 Primary','P12 Primary Inc.','p12-hosted-primary','active','BBD','America/Barbados','primary-p12-hosted@example.test',now(),null),
  ('72000000-0000-4000-8000-000000001102','P12 Other','P12 Other Inc.','p12-hosted-other','onboarding','USD','America/New_York','other-p12-hosted@example.test',null,null),
  ('72000000-0000-4000-8000-000000001103','P12 Suspended','P12 Suspended Inc.','p12-hosted-suspended','suspended','BBD','America/Barbados','suspended-p12-hosted@example.test',now(),now());

insert into public.church_memberships (
  id,church_id,user_id,role,status,revoked_at
) values
  ('74000000-0000-4000-8000-000000001101','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001101','owner','active',null),
  ('74000000-0000-4000-8000-000000001102','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001102','owner','active',null),
  ('74000000-0000-4000-8000-000000001103','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001103','finance_admin','active',null),
  ('74000000-0000-4000-8000-000000001104','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001104','staff','active',null),
  ('74000000-0000-4000-8000-000000001105','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001105','staff','suspended',null),
  ('74000000-0000-4000-8000-000000001106','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001110','staff','revoked',now()),
  ('74000000-0000-4000-8000-000000001107','72000000-0000-4000-8000-000000001102','71000000-0000-4000-8000-000000001106','owner','active',null),
  ('74000000-0000-4000-8000-000000001108','72000000-0000-4000-8000-000000001103','71000000-0000-4000-8000-000000001101','owner','active',null),
  ('74000000-0000-4000-8000-000000001109','72000000-0000-4000-8000-000000001101','71000000-0000-4000-8000-000000001112','accountant','revoked',now());

select extensions.plan(77);

-- Schema, catalog, least privilege, and history preservation (1-14).
select extensions.is((select column_default from information_schema.columns where table_schema='public' and table_name='churches' and column_name='staff_revision'),'0','staff revision defaults to zero');
select extensions.ok(exists(select 1 from pg_constraint where conrelid='public.churches'::regclass and conname='churches_staff_revision_nonnegative'),'staff revision is constrained');
select extensions.is((select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='audit_action' and e.enumlabel='staff_invitation_accepted'),1::bigint,'accepted audit action exists once');
select extensions.ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='church_memberships_email_history_unique_idx'),'email history is uniquely indexed');
select extensions.is((select relrowsecurity from pg_class where oid='public.church_staff_mutation_requests'::regclass),true,'ledger has RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.church_staff_mutation_requests'::regclass),true,'ledger forces RLS');
select extensions.is((select confdeltype::text from pg_constraint where conrelid='public.church_memberships'::regclass and conname='church_memberships_user_id_fkey'),'r','Auth deletion is restrictive');
select extensions.is(has_function_privilege('authenticated','public.get_church_staff(uuid)','EXECUTE'),true,'authenticated may call roster RPC');
select extensions.is(has_function_privilege('anon','public.get_church_staff(uuid)','EXECUTE'),false,'anonymous cannot call roster RPC');
select extensions.is(has_function_privilege('authenticated','public.mutate_church_staff(uuid,uuid,bigint,text,uuid,text,text)','EXECUTE'),true,'authenticated may call mutation boundary');
select extensions.is(has_function_privilege('authenticated','public.claim_church_staff_invitation(uuid)','EXECUTE'),true,'authenticated may call claim boundary');
select extensions.is(has_table_privilege('service_role','public.church_memberships','UPDATE'),false,'service role cannot update memberships directly');
select extensions.is(has_table_privilege('authenticated','public.church_memberships','INSERT'),false,'authenticated cannot insert memberships directly');
select extensions.is(has_table_privilege('authenticated','public.church_staff_mutation_requests','SELECT'),false,'authenticated cannot inspect ledger');

-- Snapshot shape, ordering, safe copy, and authorization (15-23).
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.is((select jsonb_build_object('church',(s).church_id,'revision',(s).staff_revision,'count',cardinality((s).staff)) from (select public.get_church_staff('72000000-0000-4000-8000-000000001101') s) q),'{"church":"72000000-0000-4000-8000-000000001101","revision":0,"count":7}'::jsonb,'snapshot is scalar and complete');
select extensions.is((select ((public.get_church_staff('72000000-0000-4000-8000-000000001101')).staff)[1].membership_id),'74000000-0000-4000-8000-000000001101'::uuid,'current owner sorts first');
select extensions.is((select ((public.get_church_staff('72000000-0000-4000-8000-000000001101')).staff)[2].membership_id),'74000000-0000-4000-8000-000000001102'::uuid,'second owner remains valid and ordered');
select extensions.is((select jsonb_build_object('name',r.display_name,'access',r.access_enabled,'current',r.is_current_user) from unnest((public.get_church_staff('72000000-0000-4000-8000-000000001101')).staff) r where r.membership_id='74000000-0000-4000-8000-000000001101'),'{"name":"P12 Owner","access":true,"current":true}'::jsonb,'owner copy is canonical and access mirrors permissions');
select extensions.is((select jsonb_build_object('name',r.display_name,'access',r.access_enabled) from unnest((public.get_church_staff('72000000-0000-4000-8000-000000001101')).staff) r where r.membership_id='74000000-0000-4000-8000-000000001104'),'{"name":null,"access":true}'::jsonb,'unsafe legacy display name becomes null without hiding roster');
select extensions.ok(
  pg_catalog.strpos(
    (select to_jsonb((public.get_church_staff('72000000-0000-4000-8000-000000001101')).staff)::text),
    'user_id'
  ) = 0,
  'public roster has no user UUID field'
);
select extensions.throws_like($$select public.get_church_staff('72000000-0000-4000-8000-000000001103')$$,'%STAFF_FORBIDDEN%','suspended church fails closed');
reset role;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001103'; set local role authenticated;
select extensions.throws_like($$select public.get_church_staff('72000000-0000-4000-8000-000000001101')$$,'%STAFF_FORBIDDEN%','finance cannot read roster');
reset role;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001106'; set local role authenticated;
select extensions.throws_like($$select public.get_church_staff('72000000-0000-4000-8000-000000001101')$$,'%STAFF_FORBIDDEN%','cross-tenant owner cannot read roster');
reset role;

-- Validation and privacy-identical pending invitations (24-39).
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001101'; set local role authenticated;
select extensions.throws_like($$select public.mutate_church_staff(null,'72000000-0000-4000-8000-000000001101',0,'invite',null,'valid@example.test','staff')$$,'%STAFF_INVALID_REQUEST_ID%','null request is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',-1,'invite',null,'valid@example.test','staff')$$,'%STAFF_INVALID_EXPECTED_REVISION%','negative revision is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',0,'destroy',null,null,null)$$,'%STAFF_INVALID_OPERATION%','unknown operation is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',0,'invite',null,'bad','staff')$$,'%STAFF_INVALID_EMAIL%','invalid email is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',0,'invite',null,'valid@example.test','owner')$$,'%STAFF_INVALID_ROLE%','owner role cannot be invited');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',0,'remove','74000000-0000-4000-8000-000000001104',null,'staff')$$,'%STAFF_INVALID_ARGUMENTS%','operation arguments are strict');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',0,'invite',null,'owner-p12-hosted@example.test','staff')$$,'%STAFF_SELF_PROTECTED%','owner cannot invite their own email');
select extensions.is((select jsonb_build_object('status',status,'revision',staff_revision,'replayed',replayed) from public.mutate_church_staff('73000000-0000-4000-8000-000000001101','72000000-0000-4000-8000-000000001101',0,'invite',null,U&'\00A0CLAIM-P12-HOSTED@EXAMPLE.TEST\FEFF','staff')),'{"status":"invited","revision":1,"replayed":false}'::jsonb,'known confirmed account still receives pending opaque invitation');
reset role;
select extensions.is((select jsonb_build_object('email',invited_email,'user',user_id,'status',status) from public.church_memberships where invited_email='claim-p12-hosted@example.test'),'{"email":"claim-p12-hosted@example.test","user":null,"status":"invited"}'::jsonb,'invitation is canonical and unlinked');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001101'; set local role authenticated;
select extensions.is((select status::text from public.mutate_church_staff('73000000-0000-4000-8000-000000001102','72000000-0000-4000-8000-000000001101',1,'invite',null,'unknown-p12-hosted@example.test','staff')),'invited','unknown account receives identical pending state');
select extensions.is((select status::text from public.mutate_church_staff('73000000-0000-4000-8000-000000001103','72000000-0000-4000-8000-000000001101',2,'invite',null,'unconfirmed-p12-hosted@example.test','staff')),'invited','unconfirmed account receives identical pending state');
select extensions.is((select status::text from public.mutate_church_staff('73000000-0000-4000-8000-000000001104','72000000-0000-4000-8000-000000001101',3,'invite',null,'inactive-p12-hosted@example.test','staff')),'invited','inactive account receives identical pending state');
select extensions.is((select count(*) from public.audit_logs where request_id in ('73000000-0000-4000-8000-000000001101','73000000-0000-4000-8000-000000001102','73000000-0000-4000-8000-000000001103','73000000-0000-4000-8000-000000001104') and sanitized_changes::text like '%@%'),0::bigint,'invite audits contain no email');
select extensions.is((select r.is_current_user from unnest((public.get_church_staff('72000000-0000-4000-8000-000000001101')).staff) r where r.email='claim-p12-hosted@example.test'),false,'pending is_current_user is a non-null false boolean');
select extensions.is((select jsonb_build_object('id',membership_id,'role',role,'status',status,'revision',staff_revision) from public.mutate_church_staff('73000000-0000-4000-8000-000000001105','72000000-0000-4000-8000-000000001101',4,'invite',null,'rehire-p12-hosted@example.test','accountant')),jsonb_build_object('id','74000000-0000-4000-8000-000000001106','role','accountant','status','invited','revision',5),'revoked email history is reused');
reset role;
select extensions.is((select jsonb_build_object('user',user_id,'email',invited_email,'accepted',accepted_at,'revoked',revoked_at) from public.church_memberships where id='74000000-0000-4000-8000-000000001106'),'{"user":null,"email":"rehire-p12-hosted@example.test","accepted":null,"revoked":null}'::jsonb,'reinvite keeps email and clears live link safely');
do $$
begin
  perform set_config('p12.claim_membership_id',(select id::text from public.church_memberships where invited_email='claim-p12-hosted@example.test'),true);
  perform set_config('p12.unknown_membership_id',(select id::text from public.church_memberships where invited_email='unknown-p12-hosted@example.test'),true);
  perform set_config('p12.unconfirmed_membership_id',(select id::text from public.church_memberships where invited_email='unconfirmed-p12-hosted@example.test'),true);
  perform set_config('p12.inactive_membership_id',(select id::text from public.church_memberships where invited_email='inactive-p12-hosted@example.test'),true);
end;
$$;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001101'; set local role authenticated;

-- Conflict, replay, CAS, role, and removal lifecycle (40-60).
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',5,'invite',null,'finance-p12-hosted@example.test','staff')$$,'%STAFF_EMAIL_CONFLICT%','active membership cannot be demoted by invite');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',5,'invite',null,'suspended-p12-hosted@example.test','staff')$$,'%STAFF_EMAIL_CONFLICT%','suspended membership cannot be unlinked by invite');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',5,'invite',null,'claim-p12-hosted@example.test','staff')$$,'%STAFF_ALREADY_INVITED%','pending duplicate is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',5,'invite',null,'owner-two-p12-hosted@example.test','staff')$$,'%STAFF_OWNER_PROTECTED%','owner membership is protected');
select extensions.is((select replayed from public.mutate_church_staff('73000000-0000-4000-8000-000000001105','72000000-0000-4000-8000-000000001101',4,'invite',null,'rehire-p12-hosted@example.test','accountant')),true,'exact retry replays before stale CAS');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001105','72000000-0000-4000-8000-000000001101',4,'invite',null,'changed-p12-hosted@example.test','staff')$$,'%STAFF_IDEMPOTENCY_CONFLICT%','changed request reuse is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',4,'change_role','74000000-0000-4000-8000-000000001103',null,'staff')$$,'%STAFF_REVISION_CONFLICT%','new stale request is rejected');
select extensions.is((select jsonb_build_object('role',role,'status',status,'revision',staff_revision) from public.mutate_church_staff('73000000-0000-4000-8000-000000001106','72000000-0000-4000-8000-000000001101',5,'change_role','74000000-0000-4000-8000-000000001103',null,'accountant')),'{"role":"accountant","status":"active","revision":6}'::jsonb,'active non-owner role changes');
select extensions.is((select sanitized_changes from public.audit_logs where request_id='73000000-0000-4000-8000-000000001106'),'{"from_role":"finance_admin","membership_id":"74000000-0000-4000-8000-000000001103","to_role":"accountant"}'::jsonb,'role audit is identifier and roles only');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',6,'change_role','74000000-0000-4000-8000-000000001103',null,'accountant')$$,'%STAFF_NO_CHANGES%','role no-op is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',6,'change_role','74000000-0000-4000-8000-000000001105',null,'accountant')$$,'%STAFF_MEMBERSHIP_NOT_MANAGEABLE%','suspended role change is conservative');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',6,'change_role','74000000-0000-4000-8000-000000001102',null,'staff')$$,'%STAFF_OWNER_PROTECTED%','another owner cannot be changed');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',6,'change_role','74000000-0000-4000-8000-000000001101',null,'staff')$$,'%STAFF_SELF_PROTECTED%','caller cannot change self');
select extensions.is((select status::text from public.mutate_church_staff('73000000-0000-4000-8000-000000001107','72000000-0000-4000-8000-000000001101',6,'remove','74000000-0000-4000-8000-000000001104',null,null)),'revoked','active staff removal revokes');
select extensions.is((select status::text from public.mutate_church_staff('73000000-0000-4000-8000-000000001108','72000000-0000-4000-8000-000000001101',7,'remove',current_setting('p12.unknown_membership_id')::uuid,null,null)),'revoked','pending removal revokes');
select extensions.is((select status::text from public.mutate_church_staff('73000000-0000-4000-8000-000000001109','72000000-0000-4000-8000-000000001101',8,'remove','74000000-0000-4000-8000-000000001105',null,null)),'revoked','suspended removal revokes');
reset role;
select extensions.is((select jsonb_build_object('count',count(*),'user',max(user_id::text),'email',max(invited_email),'revoked',bool_and(revoked_at is not null)) from public.church_memberships where id='74000000-0000-4000-8000-000000001104'),'{"count":1,"user":"71000000-0000-4000-8000-000000001104","email":"staff-p12-hosted@example.test","revoked":true}'::jsonb,'removal preserves row user and email snapshots');
select extensions.is((select result_user_id_snapshot from public.church_staff_mutation_requests where request_id='73000000-0000-4000-8000-000000001107'),'71000000-0000-4000-8000-000000001104'::uuid,'private ledger preserves target identity');
select extensions.is((select sanitized_changes from public.audit_logs where request_id='73000000-0000-4000-8000-000000001107'),'{"membership_id":"74000000-0000-4000-8000-000000001104","previous_role":"staff"}'::jsonb,'removal audit is identifier and previous role only');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001101'; set local role authenticated;
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',9,'remove','74000000-0000-4000-8000-000000001104',null,null)$$,'%STAFF_ALREADY_REMOVED%','repeat remove without same request is rejected');
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001199','72000000-0000-4000-8000-000000001101',9,'remove','74000000-0000-4000-8000-000000001102',null,null)$$,'%STAFF_OWNER_PROTECTED%','owner removal is blocked');
reset role;

-- Verified self-claim, owner reservation, history security, and rollback (61-77).
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001110'; set local role authenticated;
select extensions.throws_like($$select public.claim_church_staff_invitation(current_setting('p12.claim_membership_id')::uuid)$$,'%STAFF_INVITATION_NOT_AVAILABLE%','wrong verified user receives generic claim failure');
reset role;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001108'; set local role authenticated;
select extensions.throws_like($$select public.claim_church_staff_invitation(current_setting('p12.unconfirmed_membership_id')::uuid)$$,'%STAFF_INVITATION_NOT_AVAILABLE%','unconfirmed user receives generic claim failure');
reset role;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001109'; set local role authenticated;
select extensions.throws_like($$select public.claim_church_staff_invitation(current_setting('p12.inactive_membership_id')::uuid)$$,'%STAFF_INVITATION_NOT_AVAILABLE%','inactive profile receives generic claim failure');
reset role;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001107'; set local role authenticated;
select extensions.is((select jsonb_build_object('status',status,'revision',staff_revision,'replayed',replayed) from public.claim_church_staff_invitation(current_setting('p12.claim_membership_id')::uuid)),'{"status":"active","revision":10,"replayed":false}'::jsonb,'exact verified user claims pending invitation');
reset role;
select extensions.is((select jsonb_build_object('user',m.user_id,'email',m.invited_email,'accepted',m.accepted_at is not null,'action',a.action_code,'actor',a.actor_user_id) from public.church_memberships m join public.audit_logs a on a.entity_id=m.id::text and a.action_code='staff_invitation_accepted' where m.invited_email='claim-p12-hosted@example.test'),'{"user":"71000000-0000-4000-8000-000000001107","email":"claim-p12-hosted@example.test","accepted":true,"action":"staff_invitation_accepted","actor":"71000000-0000-4000-8000-000000001107"}'::jsonb,'claim preserves email and records immutable actor/action audit');
select extensions.is((select sanitized_changes from public.audit_logs where action_code='staff_invitation_accepted' and actor_user_id='71000000-0000-4000-8000-000000001107'),jsonb_build_object('membership_id',current_setting('p12.claim_membership_id')::uuid,'role','staff'),'acceptance audit is identifier and role only');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001107'; set local role authenticated;
select extensions.is((select replayed from public.claim_church_staff_invitation(current_setting('p12.claim_membership_id')::uuid)),true,'same active user claim replays without another grant');
reset role;
insert into public.church_memberships(id,church_id,user_id,invited_email,role,status,invited_by) values('75000000-0000-4000-8000-000000001101','72000000-0000-4000-8000-000000001101',null,'invited-owner-p12-hosted@example.test','owner','invited','71000000-0000-4000-8000-000000001101');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001111'; set local role authenticated;
select extensions.is((select jsonb_build_object('role',role,'status',status,'revision',staff_revision) from public.claim_church_staff_invitation('75000000-0000-4000-8000-000000001101')),'{"role":"owner","status":"active","revision":11}'::jsonb,'P08 owner reservation can be claimed exactly');
reset role;
select extensions.is((select count(*) from public.church_memberships where church_id='72000000-0000-4000-8000-000000001101' and role='owner' and status='active'),3::bigint,'multiple valid owners remain supported');
select extensions.throws_like($$delete from auth.users where id='71000000-0000-4000-8000-000000001104'$$,'%church_memberships_user_id_fkey%','Auth deletion cannot erase revoked membership history');
set local role service_role;
select extensions.throws_like($$update public.church_memberships set role='staff' where id='74000000-0000-4000-8000-000000001103'$$,'%permission denied%','service role cannot bypass staff workflow');
select extensions.throws_like($$select * from public.church_staff_mutation_requests$$,'%permission denied%','service role cannot read private ledger');
reset role;
select extensions.throws_like($$update public.church_staff_mutation_requests set payload_sha256=repeat('a',64) where request_id='73000000-0000-4000-8000-000000001105'$$,'%STAFF_LEDGER_APPEND_ONLY%','ledger update is blocked');
select extensions.throws_like($$delete from public.church_staff_mutation_requests where request_id='73000000-0000-4000-8000-000000001105'$$,'%STAFF_LEDGER_APPEND_ONLY%','ledger delete is blocked');
select extensions.throws_like($$truncate public.church_staff_mutation_requests$$,'%STAFF_LEDGER_APPEND_ONLY%','ledger truncate is blocked');
create function public.p12_hosted_force_late_failure() returns trigger language plpgsql set search_path='' as $$begin raise exception 'P12_FORCED_LATE_FAILURE'; end;$$;
create trigger p12_hosted_force_late_failure before insert on public.church_staff_mutation_requests for each row execute function public.p12_hosted_force_late_failure();
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000001101'; set local role authenticated;
select extensions.throws_like($$select public.mutate_church_staff('73000000-0000-4000-8000-000000001198','72000000-0000-4000-8000-000000001101',11,'invite',null,'late-p12-hosted@example.test','staff')$$,'%P12_FORCED_LATE_FAILURE%','late ledger failure aborts mutation');
reset role;
drop trigger p12_hosted_force_late_failure on public.church_staff_mutation_requests;
drop function public.p12_hosted_force_late_failure();
select extensions.is((select jsonb_build_object('revision',(select staff_revision from public.churches where id='72000000-0000-4000-8000-000000001101'),'failed_members',(select count(*) from public.church_memberships where invited_email='late-p12-hosted@example.test'),'failed_ledgers',(select count(*) from public.church_staff_mutation_requests where request_id='73000000-0000-4000-8000-000000001198'),'email_in_audit',(select count(*) from public.audit_logs where church_id='72000000-0000-4000-8000-000000001101' and sanitized_changes::text like '%@%'))),'{"revision":11,"failed_members":0,"failed_ledgers":0,"email_in_audit":0}'::jsonb,'late failure rolls back and staff audits remain email-free');

select * from extensions.finish();
rollback;
