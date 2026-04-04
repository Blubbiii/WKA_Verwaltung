/**
 * Centralized email provider configuration — env-overridable.
 */

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

export const EMAIL_CONFIG = {
  smtpConnectionTimeout: envInt("SMTP_CONNECTION_TIMEOUT_MS", 10000),
  smtpGreetingTimeout: envInt("SMTP_GREETING_TIMEOUT_MS", 10000),
  smtpSocketTimeout: envInt("SMTP_SOCKET_TIMEOUT_MS", 30000),
  sendgridTimeout: envInt("SENDGRID_TIMEOUT_MS", 30000),
};
