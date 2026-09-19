import { ForbiddenError } from "./errors";

export interface Caller {
  userId: string;
  organizationId: string;
  role: "owner" | "member";
}

export function requireOwner(caller: Caller) {
  if (caller.role !== "owner") {
    throw new ForbiddenError("Only the organization owner can do this.");
  }
}
