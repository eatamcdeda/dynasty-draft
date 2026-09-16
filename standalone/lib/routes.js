import {
  findOrCreateStripeCustomer,
  hasUnlockedAccess,
  hasUsedTrial,
  identityFromCookies,
  markCustomerUnlocked,
  serializeCookie,
  TRIAL_COOKIE,
  UNLOCK_COOKIE,
  signUnlockToken,
} from "./entitlement.js";
import { insightForOverall, recordCompletedDraft } from "./history.js";
import {
  getAppUrl,
  getStripe,
  UNLOCK_AMOUNT_CENTS,
  UNLOCK_CURRENCY,
  UNLOCK_TAX_CODE,
} from "./stripe.js";

function json(res, status, body, extraCookies = []) {
  if (extraCookies.length) res.setHeader("Set-Cookie", extraCookies);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function checkoutFailureMessage(error) {
  const message = error instanceof Error ? error.message : "";
  if (/ENOTFOUND|connection to Stripe/i.test(message)) {
    return "Could not reach Stripe. Check your internet connection and try again.";
  }
  if (/tax code/i.test(message) && process.env.STRIPE_PRICE_ID) {
    return "This Stripe Price is missing a product tax code. In the Stripe Dashboard, open the product and set tax code to SaaS – personal use (txcd_10103000), or remove STRIPE_PRICE_ID to use the built-in unlock product.";
  }
  if (message) return message;
  return "Could not start checkout.";
}

export async function handleBillingRequest(req, res, url) {
  const cookieHeader = req.headers.cookie;
  const identity = identityFromCookies(cookieHeader);

  if (req.method === "GET" && url.pathname === "/api/access") {
    const unlocked = await hasUnlockedAccess(identity.userId, identity.cookies);
    const trialUsed = unlocked ? false : hasUsedTrial(identity.cookies);
    json(res, 200, { unlocked, trialUsed, amountCents: UNLOCK_AMOUNT_CENTS }, identity.extra);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/trial") {
    const unlocked = await hasUnlockedAccess(identity.userId, identity.cookies);
    if (unlocked) {
      json(res, 200, { ok: true, unlocked: true }, identity.extra);
      return true;
    }
    if (hasUsedTrial(identity.cookies)) {
      json(res, 402, { error: "Free draft already used", trialUsed: true }, identity.extra);
      return true;
    }
    json(res, 200, { ok: true, trialUsed: true }, [...identity.extra, serializeCookie(TRIAL_COOKIE, "1")]);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/checkout") {
    try {
      if (await hasUnlockedAccess(identity.userId, identity.cookies)) {
        json(res, 200, { alreadyUnlocked: true, url: "/?unlocked=1" }, identity.extra);
        return true;
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        json(res, 503, { error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to .env.local." }, identity.extra);
        return true;
      }
      const origin = getAppUrl();
      const stripe = getStripe();
      const customer = await findOrCreateStripeCustomer(identity.userId);
      const lineItems = process.env.STRIPE_PRICE_ID
        ? [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }]
        : [
            {
              price_data: {
                currency: UNLOCK_CURRENCY,
                unit_amount: UNLOCK_AMOUNT_CENTS,
                product_data: {
                  name: "Dynasty Draft — full access",
                  description:
                    "One-time unlock for unlimited drafts this season, plus upcoming live ratings and head-to-head drafts.",
                  tax_code: UNLOCK_TAX_CODE,
                },
              },
              quantity: 1,
            },
          ];
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customer.id,
        client_reference_id: identity.userId,
        metadata: { dynastyUserId: identity.userId },
        line_items: lineItems,
        success_url: `${origin}/unlock/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled`,
      });
      if (!checkout.url) {
        json(res, 502, { error: "Stripe did not return a checkout URL." }, identity.extra);
        return true;
      }
      json(res, 200, { url: checkout.url }, identity.extra);
    } catch (error) {
      console.error("Checkout session failed:", error);
      json(res, 502, { error: checkoutFailureMessage(error) }, identity.extra);
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/unlock/success") {
    const origin = getAppUrl();
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId || !process.env.STRIPE_SECRET_KEY) {
      res.writeHead(302, { Location: `${origin}/` });
      res.end();
      return true;
    }
    const checkout = await getStripe().checkout.sessions.retrieve(sessionId);
    const paidUser = checkout.metadata?.dynastyUserId;
    const paid =
      checkout.payment_status === "paid" &&
      (paidUser === identity.userId || checkout.client_reference_id === identity.userId);
    if (paid) {
      const customerId = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id;
      await markCustomerUnlocked(identity.userId, customerId);
      res.writeHead(302, {
        Location: `${origin}/?unlocked=1`,
        "Set-Cookie": [...identity.extra, serializeCookie(UNLOCK_COOKIE, signUnlockToken(identity.userId))],
      });
      res.end();
      return true;
    }
    res.writeHead(302, { Location: `${origin}/` });
    res.end();
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/webhooks/stripe") {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !process.env.STRIPE_SECRET_KEY) {
      json(res, 503, { error: "Stripe webhook is not configured" });
      return true;
    }
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      json(res, 400, { error: "Missing Stripe signature" });
      return true;
    }
    const body = await readBody(req);
    try {
      const event = getStripe().webhooks.constructEvent(body, signature, secret);
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.metadata?.dynastyUserId;
        if (userId && session.payment_status === "paid") {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          await markCustomerUnlocked(userId, customerId);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid webhook";
      json(res, 400, { error: message });
      return true;
    }
    json(res, 200, { received: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/history") {
    const unlocked = await hasUnlockedAccess(identity.userId, identity.cookies);
    if (!unlocked) {
      json(res, 401, { error: "Members only" }, identity.extra);
      return true;
    }
    const raw = await readBody(req);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: "Invalid JSON" }, identity.extra);
      return true;
    }
    const result = recordCompletedDraft(identity.userId, payload);
    json(res, result.ok ? 200 : 400, result, identity.extra);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/history/insight") {
    const unlocked = await hasUnlockedAccess(identity.userId, identity.cookies);
    if (!unlocked) {
      json(res, 200, { insight: null }, identity.extra);
      return true;
    }
    const overall = Number(url.searchParams.get("overall"));
    if (!Number.isFinite(overall) || overall < 1) {
      json(res, 200, { insight: null }, identity.extra);
      return true;
    }
    json(res, 200, { insight: insightForOverall(identity.userId, overall) }, identity.extra);
    return true;
  }

  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
