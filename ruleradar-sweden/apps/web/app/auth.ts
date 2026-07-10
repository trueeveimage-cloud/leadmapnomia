import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { databaseConfigured, getUserAuthProfileById, type UserAuthProfile } from "@ruleradar/db";
import { loadConfig } from "@ruleradar/shared";

const sessionCookie = "rr_session";
const sessionDays = 7;

export interface AuthSession {
  userId: string;
  email: string;
  name?: string | null;
  organizationId?: string | null;
  role?: string | null;
  isPlatformAdmin: boolean;
  exp: number;
}

export function authIsRequired() {
  const config = loadConfig();
  return config.NODE_ENV === "production" || databaseConfigured();
}

export function createSession(profile: UserAuthProfile): AuthSession {
  return {
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
    organizationId: profile.organizationId,
    role: profile.role,
    isPlatformAdmin: profile.isPlatformAdmin,
    exp: Math.floor(Date.now() / 1000) + sessionDays * 24 * 60 * 60
  };
}

export function issueSessionCookie(response: NextResponse, session: AuthSession) {
  const config = loadConfig();
  response.cookies.set(sessionCookie, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDays * 24 * 60 * 60
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: loadConfig().NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getSession(): Promise<AuthSession | null> {
  if (!authIsRequired()) return null;
  const store = await cookies();
  const token = store.get(sessionCookie)?.value;
  const parsed = token ? verifySession(token) : null;
  if (!parsed) return null;

  const profile = await getUserAuthProfileById(parsed.userId);
  if (!profile) return null;
  return { ...createSession(profile), exp: parsed.exp };
}

export async function requireUser(nextPath = "/app") {
  if (!authIsRequired()) return null;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

export async function requireAdmin(nextPath = "/admin") {
  if (!authIsRequired()) return null;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!session.isPlatformAdmin) redirect("/app?error=admin_required");
  return session;
}

export async function requireApiUser() {
  if (!authIsRequired()) return { session: null as AuthSession | null, response: null as NextResponse | null };
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 })
    };
  }
  return { session, response: null as NextResponse | null };
}

export async function requireApiAdmin() {
  const result = await requireApiUser();
  if (result.response || !result.session) return result;
  if (!result.session.isPlatformAdmin) {
    return {
      session: result.session,
      response: NextResponse.json({ error: "Platform admin access required." }, { status: 403 })
    };
  }
  return result;
}

function signSession(session: AuthSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const secret = loadConfig().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to issue sessions.");
  return `${payload}.${signature(payload, secret)}`;
}

function verifySession(token: string): AuthSession | null {
  const [payload, mac] = token.split(".");
  const secret = loadConfig().SESSION_SECRET;
  if (!payload || !mac || !secret || !constantSignatureEqual(signature(payload, secret), mac)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthSession;
    if (!session.userId || !session.email || !session.exp) return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantSignatureEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
