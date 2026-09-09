begin;

-- PostgreSQL requires newly-added enum values to be committed before the
-- workflow migration can use them. P15 therefore keeps its audit catalog
-- additions in this small predecessor migration.
alter type public.audit_action
  add value if not exists 'donor_profile_created';
alter type public.audit_action
  add value if not exists 'donor_profile_updated';
alter type public.audit_entity
  add value if not exists 'donor';

commit;
