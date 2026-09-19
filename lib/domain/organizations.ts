import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembers, organizations, users } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError } from "./errors";
import { requireOwner, type Caller } from "./caller";

function generateJoinCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function createOrganization(userId: string, name: string) {
  const trimmedName = name.trim() || "My organization";
  const [organization] = await db
    .insert(organizations)
    .values({ name: trimmedName, joinCode: generateJoinCode() })
    .returning();

  await db.insert(organizationMembers).values({
    userId,
    organizationId: organization.id,
    role: "owner",
  });

  await db
    .update(users)
    .set({ activeOrganizationId: organization.id })
    .where(eq(users.id, userId));

  return organization;
}

export async function joinOrganizationByCode(userId: string, joinCode: string) {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.joinCode, joinCode.trim().toUpperCase()),
  });
  if (!organization) {
    throw new NotFoundError("No organization matches that join code.");
  }

  const existing = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, organization.id),
    ),
  });
  if (!existing) {
    await db.insert(organizationMembers).values({
      userId,
      organizationId: organization.id,
      role: "member",
    });
  }

  await db
    .update(users)
    .set({ activeOrganizationId: organization.id })
    .where(eq(users.id, userId));

  return { id: organization.id, name: organization.name };
}

export async function getOrganizationForUser(userId: string, organizationId: string) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, organizationId),
    ),
  });
  if (!membership) return null;
  return { organizationId, role: membership.role as "owner" | "member" };
}

export async function switchActiveOrganization(userId: string, organizationId: string) {
  const membership = await getOrganizationForUser(userId, organizationId);
  if (!membership) {
    throw new ForbiddenError("You are not a member of that organization.");
  }
  await db
    .update(users)
    .set({ activeOrganizationId: organizationId })
    .where(eq(users.id, userId));
}

export async function rotateJoinCode(caller: Caller) {
  requireOwner(caller);
  const joinCode = generateJoinCode();
  await db
    .update(organizations)
    .set({ joinCode })
    .where(eq(organizations.id, caller.organizationId));
  return { joinCode };
}

export async function renameOrganization(caller: Caller, name: string) {
  requireOwner(caller);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Organization name cannot be empty.");
  }
  await db
    .update(organizations)
    .set({ name: trimmedName })
    .where(eq(organizations.id, caller.organizationId));
}

export async function listMembers(caller: Caller) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, caller.organizationId));
  return rows;
}

export async function removeMember(caller: Caller, targetUserId: string) {
  requireOwner(caller);
  if (targetUserId === caller.userId) {
    throw new ForbiddenError("Use leaveOrganization to remove yourself.");
  }
  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, targetUserId),
        eq(organizationMembers.organizationId, caller.organizationId),
      ),
    );
}

export async function leaveOrganization(caller: Caller) {
  // R9: prevent the last remaining owner from leaving and stranding the
  // organization with zero owners (which would make it permanently
  // unmanageable). Count current owners; if the caller is the sole owner,
  // block the removal.
  const members = await db
    .select({ userId: organizationMembers.userId, role: organizationMembers.role })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, caller.organizationId));

  const owners = members.filter((member) => member.role === "owner");
  const callerIsOwner = owners.some((owner) => owner.userId === caller.userId);
  if (callerIsOwner && owners.length === 1) {
    throw new ForbiddenError(
      "You are the only owner of this organization. Promote another member to owner or remove all other members before leaving.",
    );
  }

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, caller.userId),
        eq(organizationMembers.organizationId, caller.organizationId),
      ),
    );
  await db
    .update(users)
    .set({ activeOrganizationId: null })
    .where(eq(users.id, caller.userId));
}
