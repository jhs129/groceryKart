import { NextResponse } from "next/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/domain/errors";

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// R7: map known domain error classes to their proper HTTP status instead of
// a blanket 403, so clients can distinguish "not allowed" from "bad input"
// or "gone".
export function errorToResponse(error: unknown) {
  if (error instanceof NotFoundError) return jsonError(error.message, 404);
  if (error instanceof ForbiddenError) return jsonError(error.message, 403);
  if (error instanceof ValidationError) return jsonError(error.message, 400);
  console.error(error);
  return jsonError("Internal server error", 500);
}
