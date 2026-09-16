import { createHmac, randomUUID } from "node:crypto";
import { getStripe } from "./stripe.js";

export const UID_COOKIE = "dd_uid";
export const UNLOCK_COOKIE = "dd_unlock";
export const TRIAL_COOKIE = "dd_trial";

function signingSecret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? process.env.UNLOCK_SECRET ?? "dev-only-change-me";
}

function escapeStripeQuery(value) {
  return value.replace(/['\\]/g, "");
}

export function signUnlockToken(userId) {
  const hmac = createHmac("sha256", signingSecret()).update(userId).digest("hex");
  return `${userId}.${hmac}`;
}

export function readUnlockToken(value) {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(id).digest("hex");
  if (expected !== signature) return null;
  return id;
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return out;
}

export function serializeCookie(name, value) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365 * 5}${secure}`;
}

export function identityFromCookies(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const extra = [];
  let userId = cookies[UID_COOKIE];
  if (!userId) {
    userId = randomUUID();
    extra.push(serializeCookie(UID_COOKIE, userId));
  }
  return { userId, cookies, extra };
}

export async function hasUnlockedAccess(userId, cookies) {
  if (process.env.SKIP_PAYWALL === "true") return true;
  if (readUnlockToken(cookies[UNLOCK_COOKIE]) === userId) return true;
  if (!process.env.STRIPE_SECRET_KEY) return false;
  const escapedId = escapeStripeQuery(userId);
  try {
    const customers = await getStripe().customers.search({
      query: `metadata["dynastyUserId"]:"${escapedId}" AND metadata["dynastyDraftUnlocked"]:"true"`,
      limit: 1,
    });
    return customers.data.length > 0;
  } catch {
    return false;
  }
}

export function hasUsedTrial(cookies) {
  return cookies[TRIAL_COOKIE] === "1";
}

export async function findOrCreateStripeCustomer(userId) {
  const stripe = getStripe();
  const escapedId = escapeStripeQuery(userId);
  const existing = await stripe.customers.search({
    query: `metadata["dynastyUserId"]:"${escapedId}"`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];
  return stripe.customers.create({
    metadata: {
      dynastyUserId: userId,
      dynastyDraftUnlocked: "false",
    },
  });
}

export async function markCustomerUnlocked(userId, customerId) {
  const stripe = getStripe();
  if (customerId) {
    await stripe.customers.update(customerId, {
      metadata: {
        dynastyUserId: userId,
        dynastyDraftUnlocked: "true",
      },
    });
    return;
  }
  const escapedId = escapeStripeQuery(userId);
  const existing = await stripe.customers.search({
    query: `metadata["dynastyUserId"]:"${escapedId}"`,
    limit: 1,
  });
  if (existing.data[0]) {
    await stripe.customers.update(existing.data[0].id, {
      metadata: {
        dynastyUserId: userId,
        dynastyDraftUnlocked: "true",
      },
    });
  }
}
