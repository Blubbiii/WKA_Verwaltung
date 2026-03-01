import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface DemoRequestBody {
  name: string;
  company: string;
  email: string;
  phone?: string;
  message?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: DemoRequestBody = await req.json();

    if (!body.name?.trim() || !body.company?.trim() || !body.email?.trim()) {
      return NextResponse.json(
        { error: "Name, Unternehmen und E-Mail sind erforderlich." },
        { status: 400 }
      );
    }

    // Log the demo request
    logger.info(
      `Demo request: ${body.name} (${body.company}) <${body.email}>`
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
