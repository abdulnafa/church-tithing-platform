"use client";

import { useActionState, type ReactNode } from "react";

import {
  changeChurchStaffRoleAction,
  inviteChurchStaffAction,
  removeChurchStaffAction,
} from "@/app/church/members/staff-actions";
import { CheckIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import {
  CHURCH_STAFF_EMAIL_MAX_LENGTH,
  MANAGED_CHURCH_STAFF_ROLES,
  createInitialChurchStaffActionState,
  getChurchStaffRoleLabel,
  getChurchStaffStatusLabel,
  type ChurchStaffActionState,
  type ChurchStaffMember,
  type ChurchStaffSnapshot,
} from "@/lib/church-staff";

export type ChurchStaffManagerSnapshot = Pick<
  ChurchStaffSnapshot,
  "staffRevision" | "staff"
>;

type StaffMemberRequestIds = Readonly<{
  membershipId: string;
  changeRole: string | null;
  remove: string;
}>;

export type ChurchStaffManagerRequestIds = Readonly<{
  invite: string;
  staff: readonly StaffMemberRequestIds[];
}>;

type ChurchStaffManagerProps = Readonly<{
  snapshot: ChurchStaffManagerSnapshot;
  requestIds: ChurchStaffManagerRequestIds;
}>;

const INPUT_CLASS =
  "focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#a0a9b4]";

export function ChurchStaffManager({
  snapshot,
  requestIds,
}: ChurchStaffManagerProps) {
  const currentStaff = snapshot.staff.filter(
    (member) => member.status !== "revoked",
  );
  const removedStaff = snapshot.staff.filter(
    (member) => member.status === "revoked",
  );
  const accessEnabledCount = snapshot.staff.filter(
    (member) => member.accessEnabled,
  ).length;
  const pendingCount = snapshot.staff.filter(
    (member) => member.status === "invited",
  ).length;
  const requestsByMembership = new Map(
    requestIds.staff.map((request) => [request.membershipId, request]),
  );

  return (
    <div
      className="min-w-0 space-y-6"
      data-staff-revision={snapshot.staffRevision}
    >
      <section aria-label="Staff summary" className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Access enabled"
          value={String(accessEnabledCount)}
        />
        <SummaryCard
          label="Invites recorded"
          tone="gold"
          value={String(pendingCount)}
        />
        <SummaryCard
          label="Removed records"
          tone="muted"
          value={String(removedStaff.length)}
        />
      </section>

      <InviteStaffForm
        requestId={requestIds.invite}
        staffRevision={snapshot.staffRevision}
      />

      <section className="soft-card min-w-0 rounded-[24px] p-5 sm:p-7">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
              Saved church access
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">
              Current and pending staff
            </h2>
          </div>
          <p className="max-w-md text-xs leading-5 text-[var(--muted)]">
            Owner and self authority are protected. Role changes never alter
            the owner membership or transfer ownership.
          </p>
        </div>

        {currentStaff.length > 0 ? (
          <ul className="mt-5 space-y-4">
            {currentStaff.map((member) => (
              <li key={member.membershipId}>
                <StaffCard
                  member={member}
                  requestIds={requestsByMembership.get(member.membershipId)}
                  staffRevision={snapshot.staffRevision}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#f3f1eb] px-4 py-5 text-xs leading-5 text-[var(--muted)]">
            No current or pending staff memberships were returned.
          </p>
        )}
      </section>

      <section className="soft-card min-w-0 rounded-[24px] p-5 sm:p-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--muted)]">
          Preserved history
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight">
          Removed staff
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
          Removing access revokes the membership without deleting its history.
          Use the invitation form to record a new invitation for a former
          non-owner staff email.
        </p>

        {removedStaff.length > 0 ? (
          <ul className="mt-5 space-y-4">
            {removedStaff.map((member) => (
              <li key={member.membershipId}>
                <StaffCard
                  member={member}
                  staffRevision={snapshot.staffRevision}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#f3f1eb] px-4 py-5 text-xs text-[var(--muted)]">
            No removed staff records.
          </p>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "sage",
}: Readonly<{
  label: string;
  value: string;
  tone?: "sage" | "gold" | "muted";
}>) {
  const toneClass = {
    sage: "bg-[var(--sage-pale)] text-[var(--sage-dark)]",
    gold: "bg-[var(--gold-pale)] text-[#805d1f]",
    muted: "bg-[#ece9e1] text-[var(--ink-soft)]",
  }[tone];

  return (
    <article className="soft-card min-w-0 rounded-[20px] p-5">
      <span className={`grid size-9 place-items-center rounded-xl ${toneClass}`}>
        <UsersIcon size={16} />
      </span>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold tracking-tight [overflow-wrap:anywhere]">
        {value}
      </p>
    </article>
  );
}

function InviteStaffForm({
  requestId,
  staffRevision,
}: Readonly<{ requestId: string; staffRevision: number }>) {
  const [state, formAction, isPending] = useActionState(
    inviteChurchStaffAction,
    createInitialChurchStaffActionState(
      requestId,
      staffRevision,
      "invite",
    ),
  );

  return (
    <form
      action={formAction}
      className="soft-card min-w-0 rounded-[24px] p-5 sm:p-7"
      key={state.responseEpoch}
    >
      <MutationFields state={state} />
      <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
        Protected staff action
      </p>
      <h2 className="mt-1 text-lg font-bold tracking-tight">
        Record a staff invitation
      </h2>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
        This saves a pending invitation only. No email is sent, no account is
        created, and access is not activated. Delivery and acceptance remain
        unavailable until transactional email and account-invitation setup is
        configured.
      </p>

      <ActionFeedback state={state} />
      <RetryNotice state={state} />

      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.45fr)]">
        <StaffEmailField state={state} />
        <StaffRoleField id="new-staff-role" state={state} />
      </div>

      <div className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-2xl items-start gap-2 text-[10px] leading-5 text-[var(--muted)]">
          <ShieldIcon className="mt-0.5 shrink-0" size={14} />
          Only managed non-owner roles can be invited. Current role abilities
          follow the provisional least-privilege permission matrix.
        </p>
        <button
          className="focus-ring inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Recording invitation..."
            : state.retryRequired
              ? "Retry same request"
              : "Record invitation"}
          {!isPending ? <CheckIcon size={15} /> : null}
        </button>
      </div>
    </form>
  );
}

function StaffCard({
  member,
  staffRevision,
  requestIds,
}: Readonly<{
  member: ChurchStaffMember;
  staffRevision: number;
  requestIds?: StaffMemberRequestIds;
}>) {
  const canManageMembership =
    member.role !== "owner" &&
    !member.isCurrent &&
    member.status !== "revoked" &&
    Boolean(requestIds);
  const canChangeRole =
    canManageMembership &&
    (member.status === "active" || member.status === "invited") &&
    requestIds?.changeRole !== null;
  const displayName = member.displayName ?? fallbackDisplayName(member.status);

  return (
    <article className="min-w-0 rounded-[20px] border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-[10px] font-bold text-[var(--sage-dark)]">
              {getInitials(member.displayName, member.email)}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold [overflow-wrap:anywhere]">
                {displayName}
              </h3>
              <p className="mt-1 text-[10px] text-[var(--muted)] [overflow-wrap:anywhere]">
                {member.email}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={member.role === "owner" ? "gold" : "plain"}>
              {getChurchStaffRoleLabel(member.role)}
            </Badge>
            <Badge tone={getStatusTone(member.status)}>
              {getChurchStaffStatusLabel(member.status)}
            </Badge>
            <Badge tone={member.accessEnabled ? "sage" : "muted"}>
              {member.accessEnabled ? "Access enabled" : getNoAccessLabel(member.status)}
            </Badge>
            {member.isCurrent ? <Badge tone="blue">Your account</Badge> : null}
          </div>
        </div>

        <dl className="grid min-w-0 grid-cols-2 gap-3 text-[10px] sm:w-64">
          <div className="rounded-xl bg-[#f7f5f0] px-3 py-2.5">
            <dt className="font-bold uppercase tracking-wider text-[var(--muted)]">
              Invited
            </dt>
            <dd className="mt-1 font-semibold text-[var(--ink-soft)]">
              {formatUtcDate(member.invitedAt)}
            </dd>
          </div>
          <div className="rounded-xl bg-[#f7f5f0] px-3 py-2.5">
            <dt className="font-bold uppercase tracking-wider text-[var(--muted)]">
              {member.status === "revoked" ? "Removed" : "Accepted"}
            </dt>
            <dd className="mt-1 font-semibold text-[var(--ink-soft)]">
              {formatUtcDate(
                member.status === "revoked"
                  ? member.revokedAt
                  : member.acceptedAt,
              )}
            </dd>
          </div>
        </dl>
      </div>

      {member.status === "invited" ? (
        <p className="mt-4 rounded-xl bg-[var(--gold-pale)] px-3 py-2 text-[10px] leading-5 text-[#79581f]">
          Invitation recorded only. No invitation email has been sent and no
          account was created by this action.
        </p>
      ) : null}

      {member.role === "owner" ? (
        <p className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2 text-[10px] leading-5 text-[var(--muted)]">
          The owner membership is visible for accountability but cannot be
          edited or removed here. Owner transfer is not available.
        </p>
      ) : member.isCurrent ? (
        <p className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2 text-[10px] leading-5 text-[var(--muted)]">
          Your own membership cannot be edited or removed from this workflow.
        </p>
      ) : null}

      {canManageMembership && requestIds ? (
        <div className="mt-5 grid min-w-0 gap-3 border-t border-[var(--line)] pt-4 lg:grid-cols-2">
          {canChangeRole && requestIds.changeRole ? (
            <ChangeRoleForm
              member={member}
              requestId={requestIds.changeRole}
              staffRevision={staffRevision}
            />
          ) : (
            <p className="rounded-2xl bg-[#f7f5f0] p-4 text-[10px] leading-5 text-[var(--muted)]">
              A suspended membership cannot change roles. Remove access if it
              should remain unavailable.
            </p>
          )}
          <RemoveStaffForm
            member={member}
            requestId={requestIds.remove}
            staffRevision={staffRevision}
          />
        </div>
      ) : null}
    </article>
  );
}

function ChangeRoleForm({
  member,
  requestId,
  staffRevision,
}: Readonly<{
  member: ChurchStaffMember;
  requestId: string;
  staffRevision: number;
}>) {
  const [state, formAction, isPending] = useActionState(
    changeChurchStaffRoleAction,
    createInitialChurchStaffActionState(
      requestId,
      staffRevision,
      "change_role",
      member,
    ),
  );
  const id = `staff-role-${member.membershipId}`;

  return (
    <details className="min-w-0 rounded-2xl bg-[#f7f5f0] p-4">
      <summary
        aria-label={`Review role change for ${member.email}`}
        className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-[var(--sage-dark)] marker:hidden"
      >
        Change role
      </summary>
      <form action={formAction} className="mt-4 min-w-0" key={state.responseEpoch}>
        <MutationFields state={state} />
        <StaffRoleField id={id} state={state} />
        <ActionFeedback compact state={state} />
        <RetryNotice compact state={state} />
        <button
          className="focus-ring mt-3 inline-flex w-full items-center justify-center rounded-full bg-[var(--ink)] px-4 py-2.5 text-[10px] font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Saving role..."
            : state.retryRequired
              ? "Retry same request"
              : "Save role"}
        </button>
      </form>
    </details>
  );
}

function RemoveStaffForm({
  member,
  requestId,
  staffRevision,
}: Readonly<{
  member: ChurchStaffMember;
  requestId: string;
  staffRevision: number;
}>) {
  const [state, formAction, isPending] = useActionState(
    removeChurchStaffAction,
    createInitialChurchStaffActionState(
      requestId,
      staffRevision,
      "remove",
      member,
    ),
  );

  return (
    <details className="min-w-0 rounded-2xl border border-[#e6c5c0] bg-[#fff8f6] p-4">
      <summary
        aria-label={`Review access removal for ${member.email}`}
        className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-[#9b463b] marker:hidden"
      >
        Review access removal
      </summary>
      <p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">
        This revokes the membership while preserving its role and history. It
        does not delete an account or past records.
      </p>
      <form action={formAction} className="mt-3 min-w-0" key={state.responseEpoch}>
        <MutationFields state={state} />
        <ActionFeedback compact state={state} />
        <RetryNotice compact state={state} />
        <button
          aria-label={`Confirm access removal for ${member.email}`}
          className="focus-ring mt-3 inline-flex w-full items-center justify-center rounded-full border border-[#d9a9a1] bg-white px-4 py-2.5 text-[10px] font-bold text-[#9b463b] disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Removing access..."
            : state.retryRequired
              ? "Retry same request"
              : "Confirm removal"}
        </button>
      </form>
    </details>
  );
}

function StaffEmailField({
  state,
}: Readonly<{ state: ChurchStaffActionState }>) {
  const id = "new-staff-email";
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Staff email
      </span>
      <input
        aria-describedby={describedBy(
          helpId,
          state.fieldErrors?.email ? errorId : null,
        )}
        aria-invalid={Boolean(state.fieldErrors?.email)}
        autoComplete="email"
        className={INPUT_CLASS}
        defaultValue={state.values.email}
        id={id}
        inputMode="email"
        maxLength={CHURCH_STAFF_EMAIL_MAX_LENGTH}
        name="email"
        placeholder="team@example.org"
        required
        type="email"
      />
      <span className="mt-2 block text-[9px] leading-4 text-[var(--muted)]" id={helpId}>
        The saved email is used only to identify this pending invitation.
      </span>
      <FieldError error={state.fieldErrors?.email} id={errorId} />
    </label>
  );
}

function StaffRoleField({
  id,
  state,
}: Readonly<{ id: string; state: ChurchStaffActionState }>) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Role
      </span>
      <select
        aria-describedby={describedBy(
          helpId,
          state.fieldErrors?.role ? errorId : null,
        )}
        aria-invalid={Boolean(state.fieldErrors?.role)}
        className={INPUT_CLASS}
        defaultValue={state.values.role}
        id={id}
        name="role"
        required
      >
        {MANAGED_CHURCH_STAFF_ROLES.map((role) => (
          <option key={role} value={role}>
            {getChurchStaffRoleLabel(role)}
          </option>
        ))}
      </select>
      <span className="mt-2 block text-[9px] leading-4 text-[var(--muted)]" id={helpId}>
        Owner is intentionally unavailable. Ownership cannot be transferred
        here.
      </span>
      <FieldError error={state.fieldErrors?.role} id={errorId} />
    </label>
  );
}

function MutationFields({ state }: Readonly<{ state: ChurchStaffActionState }>) {
  return (
    <>
      <input name="requestId" type="hidden" value={state.requestId} />
      <input
        name="expectedStaffRevision"
        type="hidden"
        value={state.staffRevision}
      />
    </>
  );
}

function FieldError({
  error,
  id,
}: Readonly<{ error?: string; id: string }>) {
  return error ? (
    <span className="mt-2 block text-[10px] text-[#9b463b]" id={id}>
      {error}
    </span>
  ) : null;
}

function ActionFeedback({
  state,
  compact = false,
}: Readonly<{ state: ChurchStaffActionState; compact?: boolean }>) {
  return state.status === "idle" ? null : (
    <div aria-atomic="true" aria-live="polite">
      <p
        className={`${compact ? "mt-3" : "mt-4"} rounded-xl px-3 py-2 text-[10px] leading-5 [overflow-wrap:anywhere] ${
          state.status === "success"
            ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
            : "bg-[#f5e8e5] text-[#9b463b]"
        }`}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
    </div>
  );
}

function RetryNotice({
  state,
  compact = false,
}: Readonly<{ state: ChurchStaffActionState; compact?: boolean }>) {
  return state.retryRequired ? (
    <p
      className={`${compact ? "mt-2" : "mt-3"} rounded-xl bg-[var(--gold-pale)] px-3 py-2 text-[10px] leading-5 text-[#79581f]`}
      role="note"
    >
      This request is unconfirmed. Do not change these details or reload the
      page; retry the same request so it cannot be applied twice.
    </p>
  ) : null;
}

function Badge({
  children,
  tone,
}: Readonly<{
  children: ReactNode;
  tone: "sage" | "gold" | "blue" | "plain" | "muted";
}>) {
  const toneClass = {
    sage: "bg-[var(--sage-pale)] text-[var(--sage-dark)]",
    gold: "bg-[var(--gold-pale)] text-[#805d1f]",
    blue: "bg-[#e7edf5] text-[#496785]",
    plain: "bg-[#f3f1eb] text-[var(--ink-soft)]",
    muted: "bg-[#ece9e1] text-[var(--muted)]",
  }[tone];

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider ${toneClass}`}
    >
      {children}
    </span>
  );
}

function getStatusTone(
  status: ChurchStaffMember["status"],
): "sage" | "gold" | "blue" | "muted" {
  if (status === "active") return "sage";
  if (status === "invited") return "gold";
  if (status === "suspended") return "blue";
  return "muted";
}

function getNoAccessLabel(status: ChurchStaffMember["status"]) {
  if (status === "invited") return "Access pending";
  if (status === "revoked") return "Access removed";
  return "Access unavailable";
}

function fallbackDisplayName(status: ChurchStaffMember["status"]) {
  return status === "invited" ? "Pending invitation" : "Staff member";
}

function getInitials(displayName: string | null, email: string) {
  const source = displayName ?? email.slice(0, email.indexOf("@"));
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

function formatUtcDate(timestamp: string | null) {
  if (timestamp === null) return "Not recorded";
  return `${new Date(timestamp).toISOString().slice(0, 10)} UTC`;
}

function describedBy(...ids: readonly (string | null)[]) {
  return ids.filter((id): id is string => Boolean(id)).join(" ");
}
