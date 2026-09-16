import { NextResponse } from "next/server";
import { markCustomerUnlocked } from "@/lib/entitlement";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const body = await request.text();

  try {
    const event = getStripe().webhooks.constructEvent(body, signature, secret);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        payment_status?: string;
        metadata?: { dynastyUserId?: string };
        customer?: string | { id: string } | null;
      };
      const userId = session.metadata?.dynastyUserId;
      if (userId && session.payment_status === "paid") {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        await markCustomerUnlocked(userId, customerId);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}
