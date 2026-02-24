/**
 * Mass Communication Preview API
 *
 * POST /api/admin/mass-communication/preview
 * Returns recipient list based on filter criteria (without sending).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { getFilteredRecipients } from "@/lib/mass-communication/recipient-filter";

// =============================================================================
// Validation
// =============================================================================

const previewSchema = z.object({
  recipientFilter: z.enum(["ALL", "BY_FUND", "BY_PARK", "BY_ROLE", "ACTIVE_ONLY"]),
  fundIds: z.array(z.string()).optional(),
  parkIds: z.array(z.string()).optional(),
});

// =============================================================================
// POST /api/admin/mass-communication/preview
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = previewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { recipientFilter, fundIds, parkIds } = parsed.data;
    const tenantId = check.tenantId!;

    const recipients = await getFilteredRecipients(
      tenantId,
      recipientFilter,
      fundIds,
      parkIds
    );

    return NextResponse.json({
      recipients,
      totalCount: recipients.length,
    });
  } catch (error) {
    logger.error({ err: error }, "[Mass Communication Preview] Error");
    return NextResponse.json(
      { error: "Fehler bei der Empfänger-Vorschau" },
      { status: 500 }
    );
  }
}
