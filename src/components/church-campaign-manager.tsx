"use client";

import { useActionState } from "react";

import {
  activateCampaignAction,
  archiveCampaignAction,
  closeCampaignAction,
  createCampaignAction,
  restoreCampaignAction,
  updateCampaignAction,
} from "@/app/church/campaigns/campaign-actions";
import {
  CalendarIcon,
  CheckIcon,
  HeartIcon,
  ShieldIcon,
} from "@/components/icons";
import {
  calculateCampaignProgress,
  createInitialChurchCampaignActionState,
  formatCampaignMinorAmount,
  type ChurchCampaignAction,
  type ChurchCampaignActionState,
  type ChurchCampaignProgress,
  type ChurchCampaignStatus,
} from "@/lib/church-campaigns";

export type ChurchCampaignView = Readonly<{
  id: string;
  fundId: string;
  fundName: string;
  name: string;
  description: string | null;
  status: ChurchCampaignStatus;
  goalAmountMinorText: string | null;
  currency: string;
  visibilityStartsLabel: string | null;
  visibilityEndsLabel: string | null;
  windowState: "none" | "scheduled" | "open" | "ended";
}>;

export type ChurchCampaignManagerSnapshot = Readonly<{
  churchId: string;
  campaignsRevision: number;
  campaigns: readonly ChurchCampaignView[];
}>;

export type ChurchCampaignFundOption = Readonly<{
  id: string;
  name: string;
}>;

type CampaignRequestIds = Readonly<{
  campaignId: string;
  update: string;
  activate: string;
  close: string;
  archive: string;
  restore: string;
}>;

export type ChurchCampaignManagerRequestIds = Readonly<{
  create: string;
  campaigns: readonly CampaignRequestIds[];
}>;

type CampaignServerAction = (
  previousState: ChurchCampaignActionState,
  formData: FormData,
) => Promise<ChurchCampaignActionState>;

type BaseManagerProps = Readonly<{
  snapshot: ChurchCampaignManagerSnapshot;
  activeFunds: readonly ChurchCampaignFundOption[];
  canManage: boolean;
  requestIds: ChurchCampaignManagerRequestIds;
}>;

type ManagerProps = BaseManagerProps &
  (
    | Readonly<{
        progressState: "available";
        progress: readonly ChurchCampaignProgress[];
      }>
    | Readonly<{
        progressState: "hidden" | "unavailable";
        progress?: never;
      }>
  );

const INPUT_CLASS =
  "focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#a0a9b4]";

export function ChurchCampaignManager({
  snapshot,
  activeFunds,
  canManage,
  requestIds,
  progressState,
  progress,
}: ManagerProps) {
  const requestsByCampaign = new Map(
    requestIds.campaigns.map((request) => [request.campaignId, request]),
  );
  const progressByCampaign =
    progressState === "available"
      ? new Map(progress.map((item) => [item.campaignId, item]))
      : null;
  const counts = countCampaignStatuses(snapshot.campaigns);

  return (
    <section
      aria-labelledby="campaign-manager-title"
      className="min-w-0 space-y-6"
      data-campaigns-revision={snapshot.campaignsRevision}
    >
      <div className="soft-card overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-4 bg-[var(--gold-pale)] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[#8b621f]">
              <HeartIcon size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#8b621f]">
                Persisted campaigns
              </p>
              <h2
                className="mt-1 text-lg font-bold tracking-tight"
                id="campaign-manager-title"
              >
                Campaign management
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ink-soft)]">
                Campaign configuration is saved for this church. Goals are
                informational and never close a campaign automatically.
              </p>
            </div>
          </div>
          <span className="shrink-0 self-start rounded-full bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[#8b621f]">
            Tenant scoped
          </span>
        </div>
      </div>

      <div aria-label="Campaign summary" className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Draft" value={counts.draft} />
        <SummaryCard label="Active" tone="sage" value={counts.active} />
        <SummaryCard label="Closed" tone="muted" value={counts.closed} />
        <SummaryCard label="Archived" tone="muted" value={counts.archived} />
      </div>

      {progressState === "hidden" ? (
        <p
          className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-[var(--muted)]"
          role="note"
        >
          Campaign goals and settings are visible. Donation-derived progress is
          hidden because your role does not include financial access.
        </p>
      ) : progressState === "unavailable" ? (
        <p
          className="rounded-2xl bg-[#f5e8e5] px-4 py-3 text-[10px] leading-5 text-[#9b463b]"
          role="alert"
        >
          Confirmed online progress could not be loaded. Campaign settings are
          still available; refresh before relying on financial totals.
        </p>
      ) : (
        <p
          className="rounded-2xl bg-[var(--sage-pale)] px-4 py-3 text-[10px] leading-5 text-[var(--sage-dark)]"
          role="note"
        >
          Live checkout is disabled. Confirmed online progress below reflects
          qualifying stored online records only.
        </p>
      )}

      {canManage ? (
        activeFunds.length > 0 ? (
          <CreateCampaignForm
            activeFunds={activeFunds}
            campaignsRevision={snapshot.campaignsRevision}
            requestId={requestIds.create}
          />
        ) : (
          <p className="rounded-2xl bg-[#f5e8e5] px-4 py-3 text-xs leading-5 text-[#9b463b]">
            A campaign needs an active fund. Restore or create a fund before
            creating a campaign.
          </p>
        )
      ) : (
        <p
          className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-[var(--muted)]"
          role="note"
        >
          You have read-only campaign access. A church owner can create drafts
          and move them through the approved lifecycle.
        </p>
      )}

      <div className="soft-card rounded-[24px] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
              Giving campaigns
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">
              All campaigns
            </h2>
          </div>
          <p className="max-w-lg text-xs leading-5 text-[var(--muted)]">
            Create as draft, activate explicitly, close manually, then archive.
            Restoring an archive returns it to closed status and never reopens it.
          </p>
        </div>

        {snapshot.campaigns.length > 0 ? (
          <ul className="mt-5 space-y-4">
            {snapshot.campaigns.map((campaign) => {
              const ids = requestsByCampaign.get(campaign.id);
              return (
                <li key={campaign.id}>
                  <CampaignCard
                    campaign={campaign}
                    campaignsRevision={snapshot.campaignsRevision}
                    canManage={canManage && Boolean(ids)}
                    progress={progressByCampaign?.get(campaign.id)}
                    progressVisible={progressState === "available"}
                    requestIds={ids}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 rounded-2xl bg-[#f3f1eb] px-5 py-8 text-center">
            <p className="text-sm font-bold">No campaigns yet</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {canManage
                ? "Use the create form above to save the first draft."
                : "A church owner has not created a campaign for this workspace."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone = "gold",
}: Readonly<{
  label: string;
  value: number;
  tone?: "gold" | "sage" | "muted";
}>) {
  const toneClass = {
    gold: "bg-[var(--gold-pale)] text-[#805d1f]",
    sage: "bg-[var(--sage-pale)] text-[var(--sage-dark)]",
    muted: "bg-[#ece9e1] text-[var(--ink-soft)]",
  }[tone];
  return (
    <article className="soft-card min-w-0 rounded-[20px] p-4">
      <span className={`grid size-8 place-items-center rounded-xl ${toneClass}`}>
        <HeartIcon size={14} />
      </span>
      <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </article>
  );
}

function CreateCampaignForm({
  activeFunds,
  campaignsRevision,
  requestId,
}: Readonly<{
  activeFunds: readonly ChurchCampaignFundOption[];
  campaignsRevision: number;
  requestId: string;
}>) {
  const [state, formAction, isPending] = useActionState(
    createCampaignAction,
    createInitialChurchCampaignActionState(
      requestId,
      campaignsRevision,
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
      <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
        Owner action
      </p>
      <h2 className="mt-1 text-lg font-bold tracking-tight">
        Create a campaign draft
      </h2>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
        The fund and church currency become permanent when the draft is created.
        Activation later locks the remaining configuration.
      </p>

      <ActionFeedback state={state} />
      <RetryNotice state={state} />

      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
        <CampaignNameField state={state} />
        <CampaignFundField activeFunds={activeFunds} state={state} />
        <CampaignGoalField state={state} />
        <CampaignDescriptionField state={state} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-[10px] leading-5 text-[var(--muted)]">
          <ShieldIcon className="mt-0.5 shrink-0" size={14} />
          Campaign mutations are restricted to the church owner in v1.
        </p>
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Creating draft..."
            : state.retryRequired
              ? "Retry same request"
              : "Create draft"}
          {!isPending ? <CheckIcon size={15} /> : null}
        </button>
      </div>
    </form>
  );
}

function CampaignCard({
  campaign,
  campaignsRevision,
  canManage,
  progress,
  progressVisible,
  requestIds,
}: Readonly<{
  campaign: ChurchCampaignView;
  campaignsRevision: number;
  canManage: boolean;
  progress?: ChurchCampaignProgress;
  progressVisible: boolean;
  requestIds?: CampaignRequestIds;
}>) {
  return (
    <article className="min-w-0 rounded-[20px] border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-sm font-bold">{campaign.name}</h3>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-2 break-words text-[10px] font-semibold text-[var(--ink-soft)] [overflow-wrap:anywhere]">
            {campaign.fundName} · {campaign.currency}
          </p>
          <p className="mt-3 max-w-2xl whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">
            {campaign.description || "No description added."}
          </p>
        </div>
      </div>

      <VisibilityWindow campaign={campaign} />

      {progressVisible ? (
        progress ? (
          <CampaignProgressPanel campaign={campaign} progress={progress} />
        ) : (
          <p className="mt-4 rounded-xl bg-[#f5e8e5] px-3 py-2 text-[10px] text-[#9b463b]">
            Confirmed online progress is temporarily unavailable.
          </p>
        )
      ) : (
        <CampaignGoalOnly campaign={campaign} />
      )}

      {canManage && requestIds ? (
        <CampaignControls
          campaign={campaign}
          campaignsRevision={campaignsRevision}
          requestIds={requestIds}
        />
      ) : null}
    </article>
  );
}

function StatusBadge({ status }: Readonly<{ status: ChurchCampaignStatus }>) {
  const tone =
    status === "active"
      ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
      : status === "draft"
        ? "bg-[var(--gold-pale)] text-[#805d1f]"
        : "bg-[#ece9e1] text-[var(--muted)]";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider ${tone}`}
    >
      {status}
    </span>
  );
}

function VisibilityWindow({
  campaign,
}: Readonly<{ campaign: ChurchCampaignView }>) {
  if (
    campaign.visibilityStartsLabel === null &&
    campaign.visibilityEndsLabel === null
  ) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl bg-[#f7f5f0] px-3 py-3 text-[10px] leading-5 text-[var(--muted)]">
      <p className="flex items-center gap-2 font-bold text-[var(--ink-soft)]">
        <CalendarIcon size={13} /> Legacy visibility window (read-only)
      </p>
      <p className="mt-1">
        {campaign.visibilityStartsLabel
          ? `Starts ${campaign.visibilityStartsLabel}. `
          : ""}
        {campaign.visibilityEndsLabel
          ? `Ends ${campaign.visibilityEndsLabel}.`
          : ""}
      </p>
      {campaign.windowState === "scheduled" ? (
        <p className="mt-1">Public selection has not started yet.</p>
      ) : null}
      {campaign.windowState === "ended" ? (
        <p className="mt-1 font-semibold text-[#9b463b]">
          Giving window ended; close manually if this campaign is active. This
          date does not stop existing recurring instructions.
        </p>
      ) : null}
    </div>
  );
}

function CampaignGoalOnly({
  campaign,
}: Readonly<{ campaign: ChurchCampaignView }>) {
  const goal = campaign.goalAmountMinorText
    ? formatCampaignMinorAmount(
        campaign.goalAmountMinorText,
        campaign.currency,
      )
    : null;
  return (
    <p className="mt-4 text-[10px] text-[var(--muted)]">
      Informational goal: <strong>{goal ?? "Not set"}</strong>
    </p>
  );
}

function CampaignProgressPanel({
  campaign,
  progress,
}: Readonly<{
  campaign: ChurchCampaignView;
  progress: ChurchCampaignProgress;
}>) {
  const raised =
    formatCampaignMinorAmount(
      progress.raisedAmountMinorText,
      progress.currency,
    ) ?? "Unavailable";
  const goal = campaign.goalAmountMinorText
    ? formatCampaignMinorAmount(
        campaign.goalAmountMinorText,
        campaign.currency,
      )
    : null;
  const calculation = campaign.goalAmountMinorText
    ? calculateCampaignProgress(
        progress.raisedAmountMinorText,
        campaign.goalAmountMinorText,
      )
    : null;

  return (
    <div className="mt-4 rounded-2xl bg-[#f7f5f0] p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--sage)]">
            Confirmed online progress
          </p>
          <p className="mt-1 break-all text-sm font-bold">{raised}</p>
        </div>
        <p className="break-all text-[10px] text-[var(--muted)]">
          {progress.eligibleDonationCountText} qualifying stored gift
          {progress.eligibleDonationCountText === "1" ? "" : "s"}
        </p>
      </div>
      {goal && calculation ? (
        <>
          <div
            aria-label={`${campaign.name}: ${calculation.percentageText} of the informational goal`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={calculation.cappedPercentage}
            aria-valuetext={calculation.percentageText}
            className="mt-3 h-2 overflow-hidden rounded-full bg-white"
            role="progressbar"
          >
            <span
              className="block h-full rounded-full bg-[var(--sage)]"
              style={{ width: `${calculation.cappedPercentage}%` }}
            />
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap justify-between gap-2 text-[9px] text-[var(--muted)]">
            <span className="break-all">
              {calculation.percentageText} of goal
            </span>
            <span className="break-all">Goal {goal}</span>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[9px] text-[var(--muted)]">
          No informational goal is set. Giving does not close automatically.
        </p>
      )}
      <p className="mt-3 text-[9px] leading-4 text-[var(--muted)]">
        Online succeeded and partially refunded gifts, less recorded refunds.
        Processor fees are not subtracted. Fully refunded, disputed,
        unconfirmed, and offline gifts are excluded.
      </p>
    </div>
  );
}

function CampaignControls({
  campaign,
  campaignsRevision,
  requestIds,
}: Readonly<{
  campaign: ChurchCampaignView;
  campaignsRevision: number;
  requestIds: CampaignRequestIds;
}>) {
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      {campaign.status === "draft" ? (
        <>
          <EditCampaignForm
            campaign={campaign}
            campaignsRevision={campaignsRevision}
            requestId={requestIds.update}
          />
          <div className="mt-3">
            <ConfirmedOperation
              action={activateCampaignAction}
              campaign={campaign}
              campaignsRevision={campaignsRevision}
              disabled={campaign.windowState === "ended"}
              disabledReason="Legacy visibility window has ended"
              label="Activate"
              note="Activation is explicit and locks the campaign configuration permanently. Goals never auto-close it."
              operation="activate"
              pendingLabel="Activating..."
              requestId={requestIds.activate}
            />
          </div>
        </>
      ) : null}

      {campaign.status === "active" ? (
        <ConfirmedOperation
          action={closeCampaignAction}
          campaign={campaign}
          campaignsRevision={campaignsRevision}
          danger
          label="Close campaign"
          note="Closing is terminal in this release and does not cancel recurring gifts. The database blocks closing while a non-final recurring gift exists."
          operation="close"
          pendingLabel="Closing..."
          requestId={requestIds.close}
        />
      ) : null}

      {campaign.status === "closed" ? (
        <ConfirmedOperation
          action={archiveCampaignAction}
          campaign={campaign}
          campaignsRevision={campaignsRevision}
          danger
          label="Archive campaign"
          note="Archiving marks this closed campaign as archived and keeps it listed here for management history. It remains unavailable for new giving, and historical gift attribution is unchanged."
          operation="archive"
          pendingLabel="Archiving..."
          requestId={requestIds.archive}
        />
      ) : null}

      {campaign.status === "archived" ? (
        <CampaignOperationForm
          action={restoreCampaignAction}
          campaign={campaign}
          campaignsRevision={campaignsRevision}
          label="Restore to closed"
          operation="restore"
          pendingLabel="Restoring..."
          requestId={requestIds.restore}
        />
      ) : null}
    </div>
  );
}

function EditCampaignForm({
  campaign,
  campaignsRevision,
  requestId,
}: Readonly<{
  campaign: ChurchCampaignView;
  campaignsRevision: number;
  requestId: string;
}>) {
  const [state, formAction, isPending] = useActionState(
    updateCampaignAction,
    createInitialChurchCampaignActionState(
      requestId,
      campaignsRevision,
      "update",
      campaign,
    ),
  );

  return (
    <details className="group rounded-2xl bg-[#f7f5f0] p-4">
      <summary
        aria-label={`Edit draft ${campaign.name}`}
        className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-[var(--sage-dark)] marker:hidden"
      >
        Edit draft details
      </summary>
      <form action={formAction} className="mt-4 min-w-0" key={state.responseEpoch}>
        <MutationFields state={state} />
        <input name="fundId" type="hidden" value={state.values.fundId} />
        <ActionFeedback state={state} />
        <RetryNotice state={state} />
        <p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">
          Assigned fund: <strong>{campaign.fundName}</strong>. Fund, currency,
          route identity, legacy visibility dates, and images are not editable.
        </p>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <CampaignNameField campaignId={campaign.id} state={state} />
          <CampaignGoalField campaignId={campaign.id} state={state} />
          <CampaignDescriptionField campaignId={campaign.id} state={state} />
        </div>
        <button
          className="focus-ring mt-4 inline-flex w-full items-center justify-center rounded-full bg-[var(--ink)] px-5 py-2.5 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Saving draft..."
            : state.retryRequired
              ? "Retry same request"
              : "Save draft details"}
        </button>
      </form>
    </details>
  );
}

function ConfirmedOperation({
  label,
  note,
  campaign,
  ...operationProps
}: Readonly<{
  label: string;
  note: string;
  campaign: ChurchCampaignView;
}> &
  Omit<
    Parameters<typeof CampaignOperationForm>[0],
    "label" | "campaign"
  >) {
  return (
    <details className="rounded-2xl border border-[var(--line)] bg-white p-3">
      <summary
        aria-label={`Review ${label.toLowerCase()} for ${campaign.name}`}
        className="focus-ring cursor-pointer list-none rounded-lg text-[10px] font-bold text-[var(--ink-soft)] marker:hidden"
      >
        Review {label.toLowerCase()}
      </summary>
      <p className="mt-3 max-w-2xl text-[9px] leading-4 text-[var(--muted)]">
        {note}
      </p>
      <div className="mt-3">
        <CampaignOperationForm
          {...operationProps}
          campaign={campaign}
          label={`Confirm ${label.toLowerCase()}`}
        />
      </div>
    </details>
  );
}

function CampaignOperationForm({
  action,
  operation,
  campaign,
  requestId,
  campaignsRevision,
  label,
  pendingLabel,
  disabled = false,
  disabledReason,
  danger = false,
}: Readonly<{
  action: CampaignServerAction;
  operation: Exclude<ChurchCampaignAction, "create" | "update">;
  campaign: ChurchCampaignView;
  requestId: string;
  campaignsRevision: number;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
}>) {
  const [state, formAction, isPending] = useActionState(
    action,
    createInitialChurchCampaignActionState(
      requestId,
      campaignsRevision,
      operation,
      campaign,
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
        aria-label={`${label} ${campaign.name}`}
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

function MutationFields({
  state,
}: Readonly<{ state: ChurchCampaignActionState }>) {
  return (
    <>
      <input name="requestId" type="hidden" value={state.requestId} />
      <input
        name="expectedCampaignsRevision"
        type="hidden"
        value={state.campaignsRevision}
      />
    </>
  );
}

function CampaignNameField({
  state,
  campaignId,
}: Readonly<{ state: ChurchCampaignActionState; campaignId?: string }>) {
  const id = campaignId ? `campaign-name-${campaignId}` : "new-campaign-name";
  const errorId = `${id}-error`;
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Campaign name
      </span>
      <input
        aria-describedby={state.fieldErrors?.name ? errorId : undefined}
        aria-invalid={Boolean(state.fieldErrors?.name)}
        autoComplete="off"
        className={INPUT_CLASS}
        defaultValue={state.values.name}
        id={id}
        name="name"
        placeholder="Community Centre"
        required
        type="text"
      />
      <FieldError error={state.fieldErrors?.name} id={errorId} />
    </label>
  );
}

function CampaignFundField({
  activeFunds,
  state,
}: Readonly<{
  activeFunds: readonly ChurchCampaignFundOption[];
  state: ChurchCampaignActionState;
}>) {
  const id = "new-campaign-fund";
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Assigned fund
      </span>
      <select
        aria-describedby={describedBy(
          helpId,
          state.fieldErrors?.fundId ? errorId : null,
        )}
        aria-invalid={Boolean(state.fieldErrors?.fundId)}
        className={INPUT_CLASS}
        defaultValue={state.values.fundId || activeFunds[0]?.id}
        id={id}
        name="fundId"
        required
      >
        {activeFunds.map((fund) => (
          <option key={fund.id} value={fund.id}>
            {fund.name}
          </option>
        ))}
      </select>
      <span className="mt-2 block text-[9px] text-[var(--muted)]" id={helpId}>
        The assigned fund cannot change after creation.
      </span>
      <FieldError error={state.fieldErrors?.fundId} id={errorId} />
    </label>
  );
}

function CampaignGoalField({
  state,
  campaignId,
}: Readonly<{ state: ChurchCampaignActionState; campaignId?: string }>) {
  const id = campaignId ? `campaign-goal-${campaignId}` : "new-campaign-goal";
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <label className="block min-w-0" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        Goal amount (optional)
      </span>
      <input
        aria-describedby={describedBy(
          helpId,
          state.fieldErrors?.goalAmount ? errorId : null,
        )}
        aria-invalid={Boolean(state.fieldErrors?.goalAmount)}
        autoComplete="off"
        className={INPUT_CLASS}
        defaultValue={state.values.goalAmount}
        id={id}
        inputMode="decimal"
        name="goalAmount"
        pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?"
        placeholder="50000.00"
        type="text"
      />
      <span className="mt-2 block text-[9px] text-[var(--muted)]" id={helpId}>
        Uses the church currency. Informational only; reaching it never closes
        the campaign.
      </span>
      <FieldError error={state.fieldErrors?.goalAmount} id={errorId} />
    </label>
  );
}

function CampaignDescriptionField({
  state,
  campaignId,
}: Readonly<{ state: ChurchCampaignActionState; campaignId?: string }>) {
  const id = campaignId
    ? `campaign-description-${campaignId}`
    : "new-campaign-description";
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
        name="description"
      />
      <FieldError error={state.fieldErrors?.description} id={errorId} />
    </label>
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
}: Readonly<{ state: ChurchCampaignActionState; compact?: boolean }>) {
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
}: Readonly<{ state: ChurchCampaignActionState; compact?: boolean }>) {
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

function describedBy(...ids: readonly (string | null)[]) {
  return ids.filter((id): id is string => Boolean(id)).join(" ");
}

function countCampaignStatuses(campaigns: readonly ChurchCampaignView[]) {
  const counts: Record<ChurchCampaignStatus, number> = {
    draft: 0,
    active: 0,
    closed: 0,
    archived: 0,
  };
  for (const campaign of campaigns) counts[campaign.status] += 1;
  return counts;
}
