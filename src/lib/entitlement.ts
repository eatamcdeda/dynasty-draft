import { createHmac, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";

export const UID_COOKIE = "dd_uid";
export const UNLOCK_COOKIE = "dd_unlock";
export const TRIAL_COOKIE = "dd_trial";

function signingSecret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? process.env.UNLOCK_SECRET ?? "dev-only-change-me";
}

function escapeStripeQuery(value: string) {
  return value.replace(/['\\]/g, "");
}

export function signUnlockToken(userId: string) {
  const hmac = createHmac("sha256", signingSecret()).update(userId).digest("hex");
  return `${userId}.${hmac}`;
}

export function readUnlockToken(value: string | undefined) {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(id).digest("hex");
  if (expected !== signature) return null;
  return id;
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365 * 5,
};

export async function getOrCreateUserId() {
  const store = await cookies();
  const existing = store.get(UID_COOKIE)?.value;
  if (existing) return existing;
  const userId = randomUUID();
  store.set(UID_COOKIE, userId, cookieBase);
  return userId;
}

export async function setUnlockCookie(userId: string) {
  const store = await cookies();
  store.set(UNLOCK_COOKIE, signUnlockToken(userId), cookieBase);
}

export async function markTrialUsed() {
  const store = await cookies();
  store.set(TRIAL_COOKIE, "1", cookieBase);
}

export async function hasUsedTrial() {
  const store = await cookies();
  return store.get(TRIAL_COOKIE)?.value === "1";
}

export async function findOrCreateStripeCustomer(options: {
  userId: string;
  email?: string | null;
  name?: string | null;
}) {
  const stripe = getStripe();
  const escapedId = escapeStripeQuery(options.userId);
  const existing = await stripe.customers.search({
    query: `metadata["dynastyUserId"]:"${escapedId}"`,
    limit: 1,
  });

  if (existing.data[0]) return existing.data[0];

  return stripe.customers.create({
    email: options.email ?? undefined,
    name: options.name ?? undefined,
    metadata: {
      dynastyUserId: options.userId,
      dynastyDraftUnlocked: "false",
    },
  });
}

export async function markCustomerUnlocked(userId: string, customerId?: string | null) {
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

export async function hasUnlockedAccess(userId: string) {
  if (process.env.SKIP_PAYWALL === "true") return true;

  const store = await cookies();
  const fromCookie = readUnlockToken(store.get(UNLOCK_COOKIE)?.value);
  if (fromCookie === userId) return true;

  if (!process.env.STRIPE_SECRET_KEY) return false;

  const escapedId = escapeStripeQuery(userId);
  try {
    const customers = await getStripe().customers.search({
      query: `metadata["dynastyUserId"]:"${escapedId}" AND metadata["dynastyDraftUnlocked"]:"true"`,
      limit: 1,
    });
    if (customers.data.length > 0) {
      await setUnlockCookie(userId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
