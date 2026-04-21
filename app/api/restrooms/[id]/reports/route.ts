import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerAuthClient } from "@/lib/auth/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { insertReport, toReportSubmissionErrorMessage } from "@/lib/supabase/reports";
import {
  buildRestroomIssueReason,
  restroomIssueOptions,
  type RestroomIssueCode
} from "@/lib/utils/communitySignals";

interface RestroomReportsRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type ReportNoteInsertRow = {
  report_id: string;
  comment: string;
};

const restroomIssueValues = restroomIssueOptions.map((option) => option.value);

const reportCreateSchema = z.object({
  issueCode: z.string().refine((value): value is RestroomIssueCode => restroomIssueValues.includes(value as RestroomIssueCode), {
    message: "Choose a valid report reason."
  }),
  browserId: z.string().trim().min(7).max(140).optional(),
  comment: z.string().max(500, "Comment must be 500 characters or fewer.").optional().default("")
});

export async function POST(request: NextRequest, context: RestroomReportsRouteContext) {
  const { id: bathroomId } = await context.params;
  if (!bathroomId.trim()) {
    return NextResponse.json({ error: "Invalid restroom report." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid report." }, { status: 400 });
  }

  const parsed = reportCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check your report and try again." }, { status: 400 });
  }

  const issueCode = parsed.data.issueCode as RestroomIssueCode;
  const normalizedComment = parsed.data.comment.trim();
  const hasComment = normalizedComment.length > 0;

  if (issueCode === "other" && !hasComment) {
    return NextResponse.json({ error: "Add a short comment so we can verify what is wrong." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (hasComment && !supabaseAdmin) {
    return NextResponse.json({ error: "Report comments are temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const supabase = supabaseAdmin ?? (await createSupabaseServerAuthClient());
  if (!supabase) {
    return NextResponse.json({ error: "Issue reporting is temporarily unavailable." }, { status: 503 });
  }

  const browserId = parsed.data.browserId?.trim() || crypto.randomUUID();
  const reason = buildRestroomIssueReason(issueCode, browserId);

  try {
    const { reportId } = await insertReport(supabase, { bathroomId, reason });

    if (hasComment && supabaseAdmin) {
      const payload: ReportNoteInsertRow = {
        report_id: reportId,
        comment: normalizedComment
      };
      const { error } = await supabaseAdmin.from("report_notes").insert(payload);

      if (error) {
        await supabaseAdmin.from("reports").delete().eq("id", reportId);
        throw new Error(error.message);
      }
    }

    return NextResponse.json({ success: true, reportId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: toReportSubmissionErrorMessage(error) }, { status: 500 });
  }
}
