"use client";

import { useState } from "react";

export function UnlockButton({
  label = "Unlock full access — $9.99",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", { method: "POST" });
      const raw = await response.text();
      let data: { url?: string; error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { url?: string; error?: string };
        } catch {
          throw new Error(
            response.ok
              ? "Checkout returned an invalid response. Try again."
              : `Could not start checkout (${response.status}).`,
          );
        }
      }
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={startCheckout}
        className="inline-flex items-center justify-center rounded-full bg-gradient-to-b from-red-600 to-red-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Redirecting to Stripe…" : label}
      </button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
