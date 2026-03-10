import crypto from "node:crypto";
import { cookies } from "next/headers";

const OPS_AUTH_COOKIE = "poopin_ops_session";
const OPS_AUTH_CONTEXT = "poopin-ops-session-v1";
const OPS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const constantTimeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
};

export const getOpsDashboardPassword = () => process.env.OPS_DASHBOARD_PASSWORD?.trim() ?? "";

const buildSessionToken = (password: string) =>
  crypto.createHmac("sha256", password).update(OPS_AUTH_CONTEXT).digest("hex");

export const verifyOpsDashboardPassword = (candidate: string) => {
  const expected = getOpsDashboardPassword();
  if (!expected || !candidate) {
    return false;
  }

  return constantTimeEqual(candidate.trim(), expected);
};

export const isOpsSessionAuthenticated = async () => {
  const expectedPassword = getOpsDashboardPassword();
  if (!expectedPassword) {
    return false;
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(OPS_AUTH_COOKIE)?.value ?? "";
  if (!sessionToken) {
    return false;
  }

  const expectedToken = buildSessionToken(expectedPassword);
  return constantTimeEqual(sessionToken, expectedToken);
};

export const setOpsSessionCookie = async () => {
  const password = getOpsDashboardPassword();
  if (!password) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: OPS_AUTH_COOKIE,
    value: buildSessionToken(password),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/ops",
    maxAge: OPS_SESSION_MAX_AGE_SECONDS
  });

  return true;
};

export const clearOpsSessionCookie = async () => {
  const cookieStore = await cookies();
  cookieStore.set({
    name: OPS_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/ops",
    maxAge: 0
  });
};
