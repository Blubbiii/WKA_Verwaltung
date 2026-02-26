/**
 * Email wrapper utilities for mailing system
 * Extracted from mass-communication route for shared use
 */

/**
 * Wrap user-provided HTML body in an email layout
 */
export function wrapEmailBody(
  body: string,
  tenantName: string,
  isTest: boolean
): string {
  const testBanner = isTest
    ? `<div style="background-color: #f59e0b; color: #000; padding: 12px; text-align: center; font-weight: bold; font-size: 14px;">
        Dies ist eine Test-E-Mail. Sie wird nur an Sie gesendet.
      </div>`
    : "";

  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
      ${testBanner}
      <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          ${body}
        </div>
        <div style="text-align: center; padding: 24px 0; color: #71717a; font-size: 12px;">
          <p>Gesendet von ${tenantName}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Strip HTML tags for plain text email version
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
