import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIp, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const DemoRequestSchema = z.object({
  name: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
  email: z.email().max(200),
  phone: z.string().max(50).optional(),
  message: z.string().max(1000).optional(),
});

/** Escape user input for safe HTML embedding in notification email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting: same tight limit as auth endpoints (public endpoint, no auth)
    const ip = getClientIp(req);
    const rl = await rateLimit(`demo-request:${ip}`, AUTH_RATE_LIMIT);
    if (!rl.success) {
      return apiError("RATE_LIMITED", 429, { message: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." });
    }

    const parsed = DemoRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabedaten." });
    }

    const { name, company, email, phone, message } = parsed.data;

    // Structured logging — no string interpolation of user input
    logger.info({ name, company, email, phone: phone ?? null }, "Demo request received");

    // Send notification email if DEMO_REQUEST_NOTIFY_EMAIL env var is set.
    // Non-blocking: failure does NOT prevent the user-facing success response.
    const notifyEmail = process.env.DEMO_REQUEST_NOTIFY_EMAIL;
    if (notifyEmail) {
      const systemTenant = await prisma.tenant
        .findFirst({ where: { slug: "system" }, select: { id: true } })
        .catch(() => null);

      if (systemTenant?.id) {
        const html = `
          <h2>Neue Demo-Anfrage</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Firma:</strong> ${escapeHtml(company)}</p>
          <p><strong>E-Mail:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
          ${phone ? `<p><strong>Telefon:</strong> ${escapeHtml(phone)}</p>` : ""}
          ${message ? `<p><strong>Nachricht:</strong></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>` : ""}
        `;

        sendEmail({
          to: notifyEmail,
          subject: `Demo-Anfrage von ${name} (${company})`,
          html,
          tenantId: systemTenant.id,
          replyTo: email,
        }).catch((err) => {
          logger.warn({ err }, "Demo request notification email failed (non-fatal)");
        });
      } else {
        logger.warn("DEMO_REQUEST_NOTIFY_EMAIL set but system tenant not found — skipping notification");
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
