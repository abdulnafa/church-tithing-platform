begin;

-- PostgreSQL requires a newly-added enum value to be committed before another
-- transaction can use it. P12 therefore adds the invitation-acceptance action
-- in this small catalog migration and installs the workflow in the next file.
alter type public.audit_action
  add value if not exists 'staff_invitation_accepted' after 'staff_invited';

commit;
