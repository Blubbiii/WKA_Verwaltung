/**
 * S3-kompatibler Storage Service für WindparkManager
 * Unterstuetzt MinIO (Entwicklung) und AWS S3 (Produktion)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";

// Environment-Variablen mit Defaults für lokale Entwicklung (MinIO)
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const S3_BUCKET = process.env.S3_BUCKET || "wpm-documents";
const S3_REGION = process.env.S3_REGION || "us-east-1";

/**
 * S3 Client Singleton
 * Konfiguriert für MinIO (lokal) oder AWS S3 (Produktion)
 */
const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  // Wichtig für MinIO: Path-Style statt Virtual-Hosted-Style
  forcePathStyle: true,
});

/**
 * Generiert einen sicheren Dateinamen mit UUID
 * Format: {tenantId}/{uuid}-{originalFilename}
 */
function generateS3Key(fileName: string, tenantId: string): string {
  const uuid = uuidv4();
  // Entferne unsichere Zeichen aus dem Dateinamen
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${tenantId}/${uuid}-${sanitizedFileName}`;
}

/**
 * Laed eine Datei in S3/MinIO hoch
 *
 * @param file - Der Datei-Buffer
 * @param fileName - Originaler Dateiname
 * @param mimeType - MIME-Type der Datei (z.B. "application/pdf")
 * @param tenantId - ID des Mandanten (für Ordnerstruktur)
 * @returns Der S3-Key unter dem die Datei gespeichert wurde
 */
export async function uploadFile(
  file: Buffer,
  fileName: string,
  mimeType: string,
  tenantId: string
): Promise<string> {
  const key = generateS3Key(fileName, tenantId);

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file,
      ContentType: mimeType,
      // Metadaten für spätere Referenz
      Metadata: {
        "original-filename": fileName,
        "tenant-id": tenantId,
        "uploaded-at": new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    return key;
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Hochladen der Datei");
    throw new Error(`Datei-Upload fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
  }
}

/**
 * Generiert eine signierte URL für den Dateizugriff
 * Die URL ist zeitlich begrenzt gültig (Standard: 1 Stunde)
 *
 * @param key - Der S3-Key der Datei
 * @param expiresIn - Gültigkeitsdauer in Sekunden (Standard: 3600 = 1 Stunde)
 * @returns Signierte URL für Download/Preview
 */
export async function getSignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const signedUrl = await awsGetSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Generieren der signierten URL");
    throw new Error(`URL-Generierung fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
  }
}

/**
 * Laedt eine Datei als Buffer direkt aus S3/MinIO.
 * Für serverseitige Verarbeitung (z.B. PDF-Merge) wo keine signierte URL benötigt wird.
 */
export async function getFileBuffer(key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("Leere Antwort von S3");
    }

    // Stream zu Buffer konvertieren
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    logger.error({ err: error, key }, "Fehler beim Laden der Datei aus S3");
    throw new Error(
      `Datei-Download fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
    );
  }
}

/**
 * Loescht eine Datei aus S3/MinIO
 *
 * @param key - Der S3-Key der zu löschenden Datei
 */
export async function deleteFile(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Löschen der Datei");
    throw new Error(`Datei-Loeschung fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
  }
}

/**
 * Prueft ob der Bucket existiert und erstellt ihn falls nicht vorhanden
 * Sollte beim App-Start oder vor dem ersten Upload aufgerufen werden
 */
export async function ensureBucket(): Promise<void> {
  try {
    // Pruefe ob Bucket existiert
    const headCommand = new HeadBucketCommand({
      Bucket: S3_BUCKET,
    });

    await s3Client.send(headCommand);
    logger.info(`S3 Bucket "${S3_BUCKET}" existiert bereits.`);
  } catch (error: unknown) {
    // Bucket existiert nicht - erstelle ihn
    // AWS SDK v3 wirft unterschiedliche Fehler je nach Provider
    const errorName = error instanceof Error ? (error as { name?: string }).name : undefined;

    if (
      errorName === "NotFound" ||
      errorName === "NoSuchBucket" ||
      (error instanceof Error && error.message.includes("404"))
    ) {
      try {
        const createCommand = new CreateBucketCommand({
          Bucket: S3_BUCKET,
        });

        await s3Client.send(createCommand);
        logger.info(`S3 Bucket "${S3_BUCKET}" wurde erstellt.`);
      } catch (createError) {
        logger.error({ err: createError }, "Fehler beim Erstellen des Buckets");
        throw new Error(
          `Bucket-Erstellung fehlgeschlagen: ${createError instanceof Error ? createError.message : "Unbekannter Fehler"}`
        );
      }
    } else {
      // Anderer Fehler (z.B. Verbindungsproblem)
      logger.error({ err: error }, "Fehler beim Prüfen des Buckets");
      throw new Error(
        `Bucket-Prüfung fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`
      );
    }
  }
}

/**
 * Gibt Informationen über die aktuelle Storage-Konfiguration zurück
 * Nützlich für Debugging und Health-Checks
 */
export function getStorageConfig() {
  return {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    region: S3_REGION,
    // Credentials werden aus Sicherheitsgruenden nicht zurückgegeben
  };
}

// Exportiere den Client für fortgeschrittene Anwendungsfaelle
export { s3Client, S3_BUCKET };
