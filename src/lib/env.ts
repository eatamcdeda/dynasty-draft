export function getAppUrl() {
  const fromEnv =
    process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? process.env.DYNASTY_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:4173";
}
