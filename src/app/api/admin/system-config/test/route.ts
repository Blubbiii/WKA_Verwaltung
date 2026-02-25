/**
 * System Configuration Test API
 *
 * POST - Test a specific configuration (SMTP, Weather API, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { getConfig, getEmailConfig, getWeatherConfig } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const testConfigSchema = z.object({
  type: z.enum(["email", "weather", "storage"]),
  testParams: z.record(z.string()).optional(), // Additional test parameters
});

// =============================================================================
// POST /api/admin/system-config/test
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = testConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { type, testParams } = parsed.data;

    switch (type) {
      case "email":
        return await testEmailConnection(check.tenantId, testParams);

      case "weather":
        return await testWeatherApi(check.tenantId);

      case "storage":
        return await testStorageConnection(check.tenantId);

      default:
        return NextResponse.json(
          { error: `Unbekannter Test-Typ: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, "[System Config Test API] Error");
    return NextResponse.json(
      { error: "Fehler beim Testen der Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

/**
 * Test SMTP email connection
 */
async function testEmailConnection(
  tenantId: string | undefined,
  testParams?: Record<string, string>
): Promise<NextResponse> {
  try {
    const emailConfig = await getEmailConfig(tenantId);

    if (!emailConfig) {
      return NextResponse.json({
        success: false,
        error: "E-Mail-Konfiguration nicht vorhanden",
        details: "SMTP Host, Benutzer und Passwort muessen konfiguriert sein.",
      });
    }

    // Optional: Send test email if recipient provided
    const recipient = testParams?.recipient;

    if (recipient) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipient)) {
        return NextResponse.json({
          success: false,
          error: "Ungültige E-Mail-Adresse",
        });
      }

      // Import nodemailer dynamically to avoid issues in edge runtime
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
          user: emailConfig.user,
          pass: emailConfig.password,
        },
      });

      // Verify connection
      await transporter.verify();

      // Send test email
      const info = await transporter.sendMail({
        from: `"${emailConfig.fromName}" <${emailConfig.fromAddress}>`,
        to: recipient,
        subject: "WindparkManager - Test-E-Mail",
        text: `Dies ist eine Test-E-Mail von WindparkManager.\n\nDie E-Mail-Konfiguration funktioniert korrekt.\n\nZeitstempel: ${new Date().toISOString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #335E99;">WindparkManager - Test-E-Mail</h2>
            <p>Dies ist eine Test-E-Mail von WindparkManager.</p>
            <p style="color: #22c55e; font-weight: bold;">Die E-Mail-Konfiguration funktioniert korrekt.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              Zeitstempel: ${new Date().toISOString()}
            </p>
          </div>
        `,
      });

      return NextResponse.json({
        success: true,
        message: `Test-E-Mail wurde erfolgreich an ${recipient} gesendet.`,
        messageId: info.messageId,
        config: {
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          fromAddress: emailConfig.fromAddress,
          fromName: emailConfig.fromName,
        },
      });
    }

    // Just verify connection without sending
    const nodemailer = await import("nodemailer");

    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.password,
      },
    });

    await transporter.verify();

    return NextResponse.json({
      success: true,
      message: "SMTP-Verbindung erfolgreich hergestellt.",
      config: {
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        fromAddress: emailConfig.fromAddress,
        fromName: emailConfig.fromName,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Email Test] Error");

    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json({
      success: false,
      error: "SMTP-Verbindung fehlgeschlagen",
      details: errorMessage,
    });
  }
}

/**
 * Test Weather API connection
 */
async function testWeatherApi(
  tenantId: string | undefined
): Promise<NextResponse> {
  try {
    const weatherConfig = await getWeatherConfig(tenantId);

    if (!weatherConfig) {
      return NextResponse.json({
        success: false,
        error: "Wetter-API-Konfiguration nicht vorhanden",
        details: "OpenWeatherMap API Key muss konfiguriert sein.",
      });
    }

    // Test API with a simple weather request (Berlin coordinates)
    const testLat = 52.52;
    const testLon = 13.405;
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${testLat}&lon=${testLon}&appid=${weatherConfig.apiKey}&units=metric`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: "Wetter-API-Anfrage fehlgeschlagen",
        details: data.message || `HTTP ${response.status}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Wetter-API-Verbindung erfolgreich.",
      config: {
        syncInterval: weatherConfig.syncInterval,
        cacheTtl: weatherConfig.cacheTtl,
      },
      testData: {
        location: data.name,
        temperature: data.main?.temp,
        windSpeed: data.wind?.speed,
        description: data.weather?.[0]?.description,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Weather API Test] Error");

    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json({
      success: false,
      error: "Wetter-API-Test fehlgeschlagen",
      details: errorMessage,
    });
  }
}

/**
 * Test Storage connection (S3/MinIO)
 */
async function testStorageConnection(
  tenantId: string | undefined
): Promise<NextResponse> {
  try {
    const provider = await getConfig("storage.provider", tenantId);

    if (provider === "local" || !provider) {
      return NextResponse.json({
        success: true,
        message: "Lokaler Speicher wird verwendet.",
        config: {
          provider: "local",
        },
      });
    }

    if (provider === "s3") {
      const endpoint = await getConfig("storage.s3.endpoint", tenantId);
      const bucket = await getConfig("storage.s3.bucket", tenantId);
      const accessKey = await getConfig("storage.s3.accessKey", tenantId);
      const secretKey = await getConfig("storage.s3.secretKey", tenantId);
      const region = await getConfig("storage.s3.region", tenantId);

      if (!endpoint || !bucket || !accessKey || !secretKey) {
        return NextResponse.json({
          success: false,
          error: "S3-Konfiguration unvollstaendig",
          details: "Endpoint, Bucket, Access Key und Secret Key muessen konfiguriert sein.",
        });
      }

      // Import AWS SDK dynamically
      try {
        const { S3Client, ListBucketsCommand, HeadBucketCommand } = await import("@aws-sdk/client-s3");

        const s3Client = new S3Client({
          region: region || "eu-central-1",
          endpoint,
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
          forcePathStyle: true, // Required for MinIO
        });

        // Check if bucket exists and is accessible
        await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));

        return NextResponse.json({
          success: true,
          message: "S3-Verbindung erfolgreich hergestellt.",
          config: {
            provider: "s3",
            endpoint,
            bucket,
            region: region || "eu-central-1",
          },
        });
      } catch (s3Error) {
        logger.error({ err: s3Error }, "[S3 Test] Error");

        return NextResponse.json({
          success: false,
          error: "S3-Verbindung fehlgeschlagen",
          details: s3Error instanceof Error ? s3Error.message : "Unbekannter Fehler",
        });
      }
    }

    return NextResponse.json({
      success: false,
      error: `Unbekannter Storage Provider: ${provider}`,
    });
  } catch (error) {
    logger.error({ err: error }, "[Storage Test] Error");

    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";

    return NextResponse.json({
      success: false,
      error: "Storage-Test fehlgeschlagen",
      details: errorMessage,
    });
  }
}
