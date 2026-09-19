import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "./db";
import { items } from "./db/schema";
import { titleCase } from "./format";
import type { Category, Location } from "./types";

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(organic|og|fresh|store|brand|select|value|extra|large|small|ct|pk|pack)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export async function findMatchingItem(rawName: string) {
  const normalized = normalizeName(rawName);
  if (!normalized) return null;

  const exact = await db.query.items.findFirst({
    where: eq(items.normalizedName, normalized),
  });
  if (exact) return exact;

  const tokens = normalized.split(" ").filter((token) => token.length > 2);
  const fuzzy = await db.query.items.findMany({
    where: or(
      ilike(items.name, `%${normalized}%`),
      ilike(items.normalizedName, `%${normalized}%`),
      ...tokens.slice(0, 3).map((token) => ilike(items.name, `%${token}%`)),
    ),
    limit: 8,
  });

  const scored = fuzzy
    .map((item) => {
      const haystack = `${item.normalizedName} ${(item.aliases ?? []).join(" ")}`;
      const overlap = tokens.filter((token) => haystack.includes(token)).length;
      const contains = haystack.includes(normalized) || normalized.includes(item.normalizedName);
      return { item, score: overlap + (contains ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score > 0 ? scored[0].item : null;
}

export async function findOrCreateItem(input: {
  name: string;
  category?: string;
  unit?: string;
  perishable?: boolean;
  location?: string;
  shelfLifeDays?: number | null;
}) {
  const existing = await findMatchingItem(input.name);
  if (existing) return existing;

  const [created] = await db
    .insert(items)
    .values({
      name: titleCase(input.name),
      normalizedName: normalizeName(input.name) || input.name.toLowerCase(),
      category: (input.category as Category | undefined) ?? "other",
      defaultUnit: input.unit ?? "each",
      perishable: input.perishable ?? true,
      defaultLocation: (input.location as Location | undefined) ?? "pantry",
      typicalShelfLifeDays: input.shelfLifeDays ?? null,
      aliases: [input.name],
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  return db.query.items.findFirst({
    where: eq(items.normalizedName, normalizeName(input.name)),
  });
}

export async function searchItems(query: string) {
  const normalized = normalizeName(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  return db.query.items.findMany({
    where: and(
      or(
        ilike(items.name, `%${normalized}%`),
        ilike(items.normalizedName, `%${normalized}%`),
        ...tokens.slice(0, 3).map((token) => ilike(items.name, `%${token}%`)),
      ),
    ),
    limit: 12,
  });
}
