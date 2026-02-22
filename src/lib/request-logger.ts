import { apiLogger } from "@/lib/logger";
import { NextRequest } from "next/server";

export function logRequest(
  request: NextRequest,
  extra?: Record<string, unknown>
) {
  apiLogger.info(
    {
      method: request.method,
      url: request.nextUrl.pathname,
      ...extra,
    },
    `${request.method} ${request.nextUrl.pathname}`
  );
}

export function logRequestError(request: NextRequest, error: unknown) {
  apiLogger.error(
    {
      method: request.method,
      url: request.nextUrl.pathname,
      err: error,
    },
    `${request.method} ${request.nextUrl.pathname} failed`
  );
}
