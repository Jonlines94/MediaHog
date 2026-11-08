import "server-only";

/** Read a required server-side environment variable, failing loudly with a helpful message. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See DEPLOYMENT.md.`);
  return v;
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mediahog.co.uk").replace(/\/$/, "");
