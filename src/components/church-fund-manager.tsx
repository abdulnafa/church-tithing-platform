"use client";

import { useActionState } from "react";

import {
  archiveFundAction,
  createFundAction,
  moveFundDownAction,
  moveFundUpAction,
  restoreFundAction,
  setDefaultFundAction,
  updateFundAction,
} from "@/app/church/campaigns/actions";
import { CheckIcon, HeartIcon, ShieldIcon } from "@/components/icons";
import {
  CHURCH_FUND_LIMITS,
  createInitialChurchFundActionState,
  type ChurchFund,
  type ChurchFundAction,
  type ChurchFundActionState,
  type ChurchFundsSnapshot,
} from "@/lib/church-funds";

export type ChurchFundView = Omit<ChurchFund, "slug">;
export type ChurchFundManagerSnapshot = Omit<
  ChurchFundsSnapshot,
  "funds"
> &
  Readonly<{ funds: readonly ChurchFundView[] }>;

type FundRequestIds = Readonly<{
  fundId: string;
  update: string;
  setDefault: string;
  moveUp: string;
  moveDown: string;
  archive: string;
  restore: string;
}>;

export type ChurchFundManagerRequestIds = Readonly<{
  create: string;
  funds: readonly FundRequestIds[];
}>;

type ChurchFundManagerProps = Readonly<{
  snapshot: ChurchFundManagerSnapshot;
  canManage: boolean;
  requestIds: ChurchFundManagerRequestIds;
}>;

type FundServerAction = (
  previousState: ChurchFundActionState,
  formData: FormData,
) => Promise<ChurchFundActionState>;

const INPUT_CLASS =
  "focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#a0a9b4]";

export function ChurchFundManager({
  snapshot,
  canManage,
  requestIds,
}: ChurchFundManagerProps) {
  const activeFunds = snapshot.funds.filter((fund) => fund.status === "active");
  const archivedFunds = snapshot.funds.filter(
    (fund) => fund.status === "archived",
  );
  const defaultFund = activeFunds.find((fund) => fund.isDefault);
  const requestsByFund = new Map(
    requestIds.funds.map((request) => [request.fundId, request]),
  );

  return (
    <div className="min-w-0 space-y-6" data-funds-revision={snapshot.fundsRevision}>
      <section
        aria-label="Fund summary"
        className="grid gap-4 sm:grid-cols-3"
      >
        <SummaryCard label="Active funds" value={String(activeFunds.length)} />
        <SummaryCard
          label="Default fund"
          tone="gold"
          value={defaultFund?.name ?? "Unavailable"}
        />
        <SummaryCard
          label="Archived funds"
          tone="muted"
          value={String(archivedFunds.length)}
        />
      </section>

      {canManage ? (
        <CreateFundForm
          fundsRevision={snapshot.fundsRevision}
          requestId={requestIds.create}
        />
      ) : (
        <p
          className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-[var(--muted)]"
          role="note"
        >
          You have read-only access to these giving categories. A church owner
          can create, edit, reorder, archive, and restore funds.
        </p>
      )}

      <section className="soft-card rounded-[24px] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
              Giving categories
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">
              Active funds
            </h2>
          </div>
          <p className="max-w-md text-xs leading-5 text-[var(--muted)]">
            This order controls future fund selection. Changing the default does
            not rewrite existing gifts or recurring instructions.
          </p>
        </div>

        <ol className="mt-5 space-y-4">
          {activeFunds.map((fund, index) => {
            const ids = requestsByFund.get(fund.id);
            return (
              <li key={fund.id}>
                <FundCard
                  canManage={canManage && Boolean(ids)}
                  fund={fund}
                  fundsRevision={snapshot.fundsRevision}
                  isFirst={index === 0}
                  isLast={index === activeFunds.length - 1}
                  position={index + 1}
                  requestIds={ids}
                />
              </li>
            );
          })}
        </ol>
      </section>

      <section className="soft-card rounded-[24px] p-5 sm:p-7">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--muted)]">
            Hidden from future giving
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">
            Archived funds
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
            Archived categories keep their stable identity and historical gift
            attribution. Restoring one appends it to the active list.
          </p>
        </div>

        {archivedFunds.length > 0 ? (
          <ul className="mt-5 space-y-4">
            {archivedFunds.map((fund) => {
              const ids = requestsByFund.get(fund.id);
              return (
                <li key={fund.id}>
                  <FundCard
                    canManage={canManage && Boolean(ids)}
                    fund={fund}
                    fundsRevision={snapshot.fundsRevision}
                    isFirst={false}
                    isLast={false}
                    requestIds={ids}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl bg-[#f3f1eb] px-4 py-5 text-xs text-[var(--muted)]">
            No archived funds.
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
        <HeartIcon size={16} />
      </span>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-bold tracking-tight" title={value}>
        {value}
      </p>
    </article>
  );
}

function CreateFundForm({
  requestId,
  fundsRevision,
}: Readonly<{ requestId: string; fundsRevision: number }>) {
  const [state, formAction, isPending] = useActionState(
    createFundAction,
    createInitialChurchFundActionState(
      requestId,
      fundsRevision,
      "create",
    ),
  );

  return (
    <form
      action={formAction}
      className="soft-card min-w-0 rounded-[24px] p-5 sm:p-7"
      key={state.responseEpoch}
    >
      <MutationFields state={state} />
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
          Owner action
        </p>
        <h2 className="text-lg font-bold tracking-tight">Create a fund</h2>
        <p className="max-w-2xl text-xs leading-5 text-[var(--muted)]">
          New funds are appended to the active list. A stable internal identity
          is created automatically so past records stay connected.
        </p>
      </div>

      <ActionFeedback state={state} />
      <RetryNotice state={state} />

      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
        <FundNameField state={state} />
        <FundDescriptionField state={state} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-[10px] leading-5 text-[var(--muted)]">
          <ShieldIcon className="mt-0.5 shrink-0" size={14} />
          Fund mutations are restricted to the church owner in v1.
        </p>
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Creating fund..."
            : state.retryRequired
              ? "Retry same request"
              : "Create fund"}
          {!isPending ? <CheckIcon size={15} /> : null}
        </button>
      </div>
    </form>
  );
}

function FundCard({
  fund,
  canManage,
  fundsRevision,
  isFirst,
  isLast,
  position,
  requestIds,
}: Readonly<{
  fund: ChurchFundView;
  canManage: boolean;
  fundsRevision: number;
  isFirst: boolean;
  isLast: boolean;
  position?: number;
  requestIds?: FundRequestIds;
}>) {
  const active = fund.status === "active";

  return (
    <article className="min-w-0 rounded-[20px] border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {position ? (
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#f3f1eb] text-[9px] font-bold text-[var(--muted)]">
                {position}
              </span>
            ) : null}
            <h3 className="break-words text-sm font-bold">{fund.name}</h3>
            {fund.isDefault ? (
              <span className="rounded-full bg-[var(--gold-pale)] px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-[#805d1f]">
                Default
              </span>
            ) : null}
            <span
              className={`rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider ${
                active
                  ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
                  : "bg-[#ece9e1] text-[var(--muted)]"
              }`}
            >
              {fund.status}
            </span>
          </div>
          <p className="mt-3 max-w-2xl whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">
            {fund.description || "No description added."}
          </p>
        </div>
      </div>

      {canManage && requestIds ? (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <EditFundForm
            fund={fund}
            fundsRevision={fundsRevision}
            requestId={requestIds.update}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {active ? (
              <>
                <FundOperationForm
                  action={moveFundUpAction}
                  disabled={isFirst}
                  disabledReason="Already first"
                  fund={fund}
                  fundsRevision={fundsRevision}
                  label="Move up"
                  operation="move_up"
                  pendingLabel="Moving..."
                  requestId={requestIds.moveUp}
                />
                <FundOperationForm
                  action={moveFundDownAction}
                  disabled={isLast}
                  disabledReason="Already last"
                  fund={fund}
                  fundsRevision={fundsRevision}
                  label="Move down"
                  operation="move_down"
                  pendingLabel="Moving..."
                  requestId={requestIds.moveDown}
                />
                <FundOperationForm
                  action={setDefaultFundAction}
                  disabled={fund.isDefault}
                  disabledReason="Current default"
                  fund={fund}
                  fundsRevision={fundsRevision}
                  label="Make default"
                  operation="set_default"
                  pendingLabel="Saving default..."
                  requestId={requestIds.setDefault}
                />
                <FundOperationForm
                  action={archiveFundAction}
                  danger
                  disabled={fund.isDefault}
                  disabledReason="Choose another default first"
                  fund={fund}
                  fundsRevision={fundsRevision}
                  label="Archive"
                  operation="archive"
                  pendingLabel="Archiving..."
                  requestId={requestIds.archive}
                />
              </>
            ) : (
              <FundOperationForm
                action={restoreFundAction}
                fund={fund}
                fundsRevision={fundsRevision}
                label="Restore to active list"
                operation="restore"
                pendingLabel="Restoring..."
                requestId={requestIds.restore}
              />
            )}
          </div>
          {active && !fund.isDefault ? (
            <p className="mt-3 text-[9px] leading-4 text-[var(--muted)]">
              Archive remains blocked if this fund has a draft/active campaign
              or a non-final recurring gift. Historical donations never block
              archiving and are never rewritten.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EditFundForm({
  fund,
  fundsRevision,
  requestId,
}: Readonly<{
  fund: ChurchFundView;
  fundsRevision: number;
  requestId: string;
}>) {
  const [state, formAction, isPending] = useActionState(
    updateFundAction,
    createInitialChurchFundActionState(
      requestId,
      fundsRevision,
      "update",
      fund,
    ),
  );

  return (
    <details className="group rounded-2xl bg-[#f7f5f0] p-4">
      <summary
        aria-label={`Edit ${fund.name} name or description`}
        className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-[var(--sage-dark)] marker:hidden"
      >
        Edit name or description
      </summary>
      <form action={formAction} className="mt-4 min-w-0" key={state.responseEpoch}>
        <MutationFields state={state} />
        <ActionFeedback state={state} />
        <RetryNotice state={state} />
        <p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">
          Renaming this category does not change its stable identity or rewrite
          historical gifts.
        </p>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <FundNameField fundId={fund.id} state={state} />
          <FundDescriptionField fundId={fund.id} state={state} />
        </div>
        <button
          className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-2.5 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Saving fund..."
            : state.retryRequired
              ? "Retry same request"
              : "Save fund details"}
        </button>
      </form>
    </details>
  );
}

function FundOperationForm({
  action,
  operation,
  fund,
  requestId,
  fundsRevision,
  label,
  pendingLabel,
  disabled = false,
  disabledReason,
  danger = false,
}: Readonly<{
  action: FundServerAction;
  operation: Exclude<ChurchFundAction, "create" | "update">;
  fund: ChurchFundView;
  requestId: string;
  fundsRevision: number;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
}>) {
  const [state, formAction, isPending] = useActionState(
    action,
    createInitialChurchFundActionState(
      requestId,
      fundsRevision,
      operation,
      fund,
    ),
  );
  const buttonText = disabled
    ? disabledReason || label
    : isPending
      ? pendingLabel
      : state.retryRequired
        ? "Retry same request"
        : label;

  return (
    <form action={formAction} className="min-w-0" key={state.responseEpoch}>
      <MutationFields state={state} />
      <button
        aria-label={`${label} ${fund.name}`}
        className={`focus-ring rounded-full border px-3.5 py-2 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-55 ${
          danger
            ? "border-[#e6c5c0] bg-[#fff8f6] text-[#9b463b]"
            : "border-[var(--line)] bg-white text-[var(--ink-soft)]"
        }`}
        disabled={disabled || isPending}
        title={disabled ? disabledReason : undefined}
        type="submit"
      >
        {buttonText}
      </button>
      <ActionFeedback compact state={state} />
      <RetryNotice compact state={state} />
    </form>
  );
}

function MutationFields({ state }: Readonly<{ state: ChurchFundActionState }>) {
  return (
    <>
      <input name="requestId" type="hidden" value={state.requestId} />
      <input
        name="expectedFundsRevision"
        type="hidden"
        value={state.fundsRevision}
      />
    </>
  );
}

function FundNameField({
  state,
  fundId,
}: Readonly<{ state: ChurchFundActionState; fundId?: string }>) {
  const id = fundId ? `fund-name-${fundId}` : "new-fund-name";
  const errorId = `${id}-error`;
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Fund name
      </span>
      <input
        aria-describedby={state.fieldErrors?.name ? errorId : undefined}
        aria-invalid={Boolean(state.fieldErrors?.name)}
        autoComplete="off"
        className={INPUT_CLASS}
        defaultValue={state.values.name}
        id={id}
        maxLength={CHURCH_FUND_LIMITS.name}
        name="name"
        placeholder="Youth Ministry"
        required
        type="text"
      />
      <FieldError error={state.fieldErrors?.name} id={errorId} />
    </label>
  );
}

function FundDescriptionField({
  state,
  fundId,
}: Readonly<{ state: ChurchFundActionState; fundId?: string }>) {
  const id = fundId
    ? `fund-description-${fundId}`
    : "new-fund-description";
  const errorId = `${id}-error`;
  return (
    <label className="block min-w-0 sm:col-span-2" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Description (optional)
      </span>
      <textarea
        aria-describedby={state.fieldErrors?.description ? errorId : undefined}
        aria-invalid={Boolean(state.fieldErrors?.description)}
        className={`${INPUT_CLASS} min-h-24 resize-y`}
        defaultValue={state.values.description}
        id={id}
        maxLength={CHURCH_FUND_LIMITS.description}
        name="description"
      />
      <FieldError
        error={state.fieldErrors?.description}
        id={errorId}
      />
    </label>
  );
}

function FieldError({
  error,
  id,
}: Readonly<{
  error?: string;
  id: string;
}>) {
  return error ? (
    <span className="mt-2 block text-[10px] text-[#9b463b]" id={id}>
      {error}
    </span>
  ) : null;
}

function ActionFeedback({
  state,
  compact = false,
}: Readonly<{ state: ChurchFundActionState; compact?: boolean }>) {
  return state.status === "idle" ? null : (
    <div aria-atomic="true" aria-live="polite">
      <p
        className={`${compact ? "mt-2 max-w-xs" : "mt-4"} rounded-xl px-3 py-2 text-[10px] leading-5 ${
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
}: Readonly<{ state: ChurchFundActionState; compact?: boolean }>) {
  return state.retryRequired ? (
    <p
      className={`${compact ? "mt-2 max-w-xs" : "mt-3"} rounded-xl bg-[var(--gold-pale)] px-3 py-2 text-[10px] leading-5 text-[#79581f]`}
      role="note"
    >
      This request is unconfirmed. Do not change these details or reload the
      page; retry the same request so it cannot be applied twice.
    </p>
  ) : null;
}
