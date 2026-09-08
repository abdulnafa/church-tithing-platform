"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, SearchIcon } from "@/components/icons";
import type {
  ChurchTransactionExportDetail,
  ChurchTransactionFundOption,
  ChurchTransactionRow,
} from "@/lib/church-transaction-view";
import { formatDate, formatGivingFrequency, formatMoney } from "@/lib/utils";

type ChurchTransactionsProps = Readonly<{
  rows: readonly ChurchTransactionRow[];
  funds: readonly ChurchTransactionFundOption[];
}> &
  (
    | Readonly<{
        canExport: false;
        exportDetails?: never;
      }>
    | Readonly<{
        canExport: true;
        exportDetails: readonly ChurchTransactionExportDetail[];
      }>
  );

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function ChurchTransactions(props: ChurchTransactionsProps) {
  const { funds, rows } = props;
  const [query, setQuery] = useState("");
  const [fundId, setFundId] = useState("all");

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesFund = fundId === "all" || row.fundId === fundId;
      const fund = funds.find((item) => item.id === row.fundId);
      const searchText = `${row.donorName} ${row.receiptNumber ?? ""} ${fund?.name ?? ""}`.toLowerCase();
      return matchesFund && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [fundId, funds, query, rows]);

  function downloadCsv() {
    if (!props.canExport) return;

    const exportDetails = new Map(
      props.exportDetails.map((detail) => [detail.transactionId, detail]),
    );
    const csvRows = visibleRows.map((row) => {
      const fund = funds.find((item) => item.id === row.fundId);
      const exportDetail = exportDetails.get(row.id);
      return [
        row.receiptNumber ?? "",
        row.createdAt,
        row.donorName,
        exportDetail?.donorEmail ?? "",
        fund?.name ?? "",
        formatGivingFrequency(row.frequency),
        String(row.amount.amountMinor / 100),
        row.amount.currency,
        String((exportDetail?.processingFee.amountMinor ?? 0) / 100),
        String(row.netAmount.amountMinor / 100),
        row.status,
      ].map(csvCell).join(",");
    });
    const header = ["Receipt", "Date", "Donor", "Email", "Fund", "Frequency", "Gross", "Currency", "Fee", "Net", "Status"].map(csvCell).join(",");
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "harbour-grace-donations.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search transactions</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input
            className="focus-ring w-full rounded-full border border-[var(--line)] bg-white py-2.5 pl-10 pr-4 text-xs outline-none placeholder:text-[#9aa5b1]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search donor, receipt or fund"
            type="search"
            value={query}
          />
        </label>
        <select
          aria-label="Filter by fund"
          className="focus-ring rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-xs font-semibold outline-none"
          onChange={(event) => setFundId(event.target.value)}
          value={fundId}
        >
          <option value="all">All funds</option>
          {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
        </select>
        {props.canExport ? (
          <button
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-xs font-bold text-white"
            onClick={downloadCsv}
            type="button"
          >
            <DownloadIcon size={15} /> Export CSV
          </button>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--line)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              <th className="px-2 py-3">Donor</th>
              <th className="px-2 py-3">Fund</th>
              <th className="px-2 py-3">Date</th>
              <th className="px-2 py-3">Frequency</th>
              <th className="px-2 py-3 text-right">Gross</th>
              <th className="px-2 py-3 text-right">Net</th>
              <th className="px-2 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {visibleRows.map((row) => {
              const fund = funds.find((item) => item.id === row.fundId);
              return (
                <tr className="text-xs" key={row.id}>
                  <td className="px-2 py-3.5">
                    <p className="font-bold">{row.donorName}</p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">{row.receiptNumber}</p>
                  </td>
                  <td className="px-2 py-3.5 font-semibold">{fund?.name}</td>
                  <td className="px-2 py-3.5 text-[var(--muted)]">{formatDate(row.createdAt)}</td>
                  <td className="px-2 py-3.5 text-[var(--muted)]">{formatGivingFrequency(row.frequency)}</td>
                  <td className="px-2 py-3.5 text-right font-bold">{formatMoney(row.amount)}</td>
                  <td className="px-2 py-3.5 text-right text-[var(--muted)]">{formatMoney(row.netAmount)}</td>
                  <td className="px-2 py-3.5 text-right"><span className="rounded-full bg-[var(--sage-pale)] px-2 py-1 text-[8px] font-bold uppercase text-[var(--sage-dark)]">Received</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleRows.length === 0 && <p className="py-10 text-center text-xs text-[var(--muted)]">No matching donations.</p>}
      </div>
    </div>
  );
}
