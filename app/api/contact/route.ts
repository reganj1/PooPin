import { NextRequest, NextResponse } from "next/server";
import { insertContactSubmission, toContactSubmissionErrorMessage } from "@/lib/supabase/contact";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { contactSubmissionSchema } from "@/lib/validations/contact";

const CONTACT_COOLDOWN_MS = 30_000;
const STORE_TTL_MS = 10 * 60_000;

declare global {
  var __poopinContactCooldownStore: Map<string, number> | undefined;
}

const getCooldownStore = () => {
  if (!globalThis.__poopinContactCooldownStore) {
    globalThis.__poopinContactCooldownStore = new Map<string, number>();
  }
  return globalThis.__poopinContactCooldownStore;
};

const pruneStore = (store: Map<string, number>, now: number) => {
  for (const [key, timestamp] of store.entries()) {
    if (now - timestamp > STORE_TTL_MS) {
      store.delete(key);
    }
  }
};

const getClientIp = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return "unknown";
  }

  const [firstIp] = forwarded.split(",");
  return firstIp?.trim() || "unknown";
};

const getRateLimitKey = (request: NextRequest) => {
  const ip = getClientIp(request);
  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 120);
  return `contact:${ip}:${userAgent}`;
};

export async function POST(request: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid contact form." }, { status: 400 });
  }

  const parsed = contactSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  const now = Date.now();
  const cooldownStore = getCooldownStore();
  pruneStore(cooldownStore, now);

  const rateLimitKey = getRateLimitKey(request);
  const previousSubmissionAt = cooldownStore.get(rateLimitKey);
  if (previousSubmissionAt) {
    const remainingMs = Math.max(0, CONTACT_COOLDOWN_MS - (now - previousSubmissionAt));
    if (remainingMs > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before sending another message.`
        },
        { status: 429 }
      );
    }
  }

  cooldownStore.set(rateLimitKey, now);

  const supabase = getSupabaseAdminClient() ?? getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Contact is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  try {
    const result = await insertContactSubmission(supabase, parsed.data, {
      userAgent: request.headers.get("user-agent")
    });

    if (process.env.NODE_ENV !== "production") {
      console.groupCollapsed("[Poopin] contact submission");
      console.log("submissionId:", result.submissionId);
      console.log("receivedAt:", new Date(now).toISOString());
      console.groupEnd();
    }

    return NextResponse.json(
      {
        success: true,
        submissionId: result.submissionId,
        message: "Thanks for reaching out. Our team will review this message shortly."
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: toContactSubmissionErrorMessage(error) }, { status: 500 });
  }
}
