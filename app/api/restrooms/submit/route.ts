import { NextRequest, NextResponse } from "next/server";
import { submitBathroom, toAddRestroomErrorMessage } from "@/lib/supabase/bathrooms";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { bathroomCreateSchema } from "@/lib/validations/bathroom";

const COOLDOWN_MS = 60_000;
const COOLDOWN_COOKIE_KEY = "poopin_add_restroom_last";
const COOLDOWN_COOKIE_MAX_AGE_SECONDS = 60 * 60;
const COOLDOWN_MEMORY_TTL_MS = 10 * 60_000;

declare global {
  var __poopinRestroomSubmitCooldownStore: Map<string, number> | undefined;
}

const getCooldownStore = () => {
  if (!globalThis.__poopinRestroomSubmitCooldownStore) {
    globalThis.__poopinRestroomSubmitCooldownStore = new Map<string, number>();
  }
  return globalThis.__poopinRestroomSubmitCooldownStore;
};

const pruneCooldownStore = (store: Map<string, number>, now: number) => {
  for (const [key, timestamp] of store.entries()) {
    if (now - timestamp > COOLDOWN_MEMORY_TTL_MS) {
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
  return `restroom-submit:${ip}:${userAgent}`;
};

const getCookieCooldownTimestamp = (request: NextRequest) => {
  const raw = request.cookies.get(COOLDOWN_COOKIE_KEY)?.value;
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getRemainingCooldownMs = (now: number, previousTimestamp: number) =>
  Math.max(0, COOLDOWN_MS - (now - previousTimestamp));

export async function POST(request: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Please submit a valid restroom form." }, { status: 400 });
  }

  const parsed = bathroomCreateSchema.safeParse(rawBody);
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
  pruneCooldownStore(cooldownStore, now);

  const rateLimitKey = getRateLimitKey(request);
  const previousRequestTimestamp = cooldownStore.get(rateLimitKey);
  if (previousRequestTimestamp) {
    const remainingMs = getRemainingCooldownMs(now, previousRequestTimestamp);
    if (remainingMs > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before submitting another restroom.`
        },
        { status: 429 }
      );
    }
  }

  const previousCookieTimestamp = getCookieCooldownTimestamp(request);
  if (previousCookieTimestamp) {
    const remainingMs = getRemainingCooldownMs(now, previousCookieTimestamp);
    if (remainingMs > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before submitting another restroom.`
        },
        { status: 429 }
      );
    }
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Restroom submissions are temporarily unavailable." }, { status: 503 });
  }

  try {
    const result = await submitBathroom(supabase, parsed.data);

    if (result.outcome === "duplicate") {
      cooldownStore.set(rateLimitKey, now);
      const response = NextResponse.json(
        {
          error: "A similar restroom is already listed nearby.",
          duplicateBathroomId: result.duplicateBathroomId ?? null
        },
        { status: 409 }
      );
      response.cookies.set(COOLDOWN_COOKIE_KEY, String(now), {
        maxAge: COOLDOWN_COOKIE_MAX_AGE_SECONDS,
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
      return response;
    }

    cooldownStore.set(rateLimitKey, now);
    const response = NextResponse.json(
      {
        success: true,
        bathroomId: result.bathroomId,
        status: result.status
      },
      { status: 201 }
    );
    response.cookies.set(COOLDOWN_COOKIE_KEY, String(now), {
      maxAge: COOLDOWN_COOKIE_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: toAddRestroomErrorMessage(error)
      },
      { status: 500 }
    );
  }
}
