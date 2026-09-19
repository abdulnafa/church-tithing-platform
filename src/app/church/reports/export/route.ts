import { requireChurchPermissions } from "@/lib/auth/guards";
import {
  createChurchReportCsv,
  createChurchReportFilename,
  parseChurchReportExportSearchParams,
} from "@/lib/church-report-export";
import { exportChurchGivingReport } from "@/lib/church-report-export-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

function errorResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  const { workspace } = await requireChurchPermissions([
    "financial_read",
    "reports_read",
    "reports_export",
  ]);
  const parsed = parseChurchReportExportSearchParams(
    new URL(request.url).searchParams,
  );
  if (!parsed.ok) {
    return errorResponse("The report export request is invalid.", 400);
  }

  let result: Awaited<ReturnType<typeof exportChurchGivingReport>>;
  try {
    const client = await createServerSupabaseClient();
    result = await exportChurchGivingReport(
      client,
      workspace.churchId,
      crypto.randomUUID(),
      parsed.selection,
    );
  } catch {
    return errorResponse("The report export is temporarily unavailable.", 503);
  }

  if (!result.ok) {
    if (result.reason === "invalid_request") {
      return errorResponse("The report export request is invalid.", 400);
    }
    if (result.reason === "forbidden") {
      return errorResponse("You do not have access to this report export.", 403);
    }
    if (result.reason === "too_large") {
      return errorResponse(
        "This report is too large to export at once. Choose a shorter period.",
        413,
      );
    }
    return errorResponse("The report export is temporarily unavailable.", 503);
  }

  return new Response(createChurchReportCsv(result.report), {
    status: 200,
    headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      "Content-Disposition": `attachment; filename="${createChurchReportFilename(result.report)}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
