import crypto from "crypto";

const METABASE_SITE_URL = process.env.NEXT_PUBLIC_METABASE_URL ?? "";
const METABASE_SECRET = process.env.METABASE_EMBEDDING_SECRET ?? "";

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

function signJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(
    crypto.createHmac("sha256", METABASE_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

export function getMetabaseDashboardUrl(dashboardId: number, params: Record<string, unknown> = {}): string {
  const token = signJwt({
    resource: { dashboard: dashboardId },
    params,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 min
  });
  return `${METABASE_SITE_URL}/embed/dashboard/${token}#bordered=false&titled=true`;
}

export function getMetabaseQuestionUrl(questionId: number, params: Record<string, unknown> = {}): string {
  const token = signJwt({
    resource: { question: questionId },
    params,
    exp: Math.round(Date.now() / 1000) + 10 * 60,
  });
  return `${METABASE_SITE_URL}/embed/question/${token}#bordered=false&titled=true`;
}

export function isMetabaseConfigured(): boolean {
  return Boolean(METABASE_SITE_URL && METABASE_SECRET);
}
