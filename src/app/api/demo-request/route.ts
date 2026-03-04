import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIp, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

const DemoRequestSchema = z.object({
  name: z.string().min(1).max(100),
  company: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(50).optional(),
  message: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limiting: same tight limit as auth endpoints (public endpoint, no auth)
    const ip = getClientIp(req);
    const rl = await rateLimit(`demo-request:${ip}`, AUTH_RATE_LIMIT);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
        { status: 429 }
      );
    }

    const parsed = DemoRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten." },
        { status: 400 }
      );
    }

    const { name, company, email, phone, message } = parsed.data;

    // Structured logging — no string interpolation of user input
    logger.info({ name, company, email, phone: phone ?? null }, "Demo request received");

    // TODO: send notification email here if needed

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
