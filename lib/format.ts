import type { Category, Location } from "./types";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "unknown date";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "unknown date";
  return dateFmt.format(date);
}

export function formatDateLong(value: Date | string | null | undefined) {
  if (!value) return "unknown date";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "unknown date";
  return dateTimeFmt.format(date);
}

export function daysFromNow(date: Date) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function formatDaysAway(date: Date | string | null | undefined) {
  if (!date) return "no date";
  const value = typeof date === "string" ? new Date(date) : date;
  const days = daysFromNow(value);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `${days}d`;
}

export function formatQty(quantity: number, unit: string) {
  const rounded =
    Number.isInteger(quantity) || Math.abs(quantity - Math.round(quantity)) < 0.05
      ? String(Math.round(quantity))
      : quantity.toFixed(1);
  return `${rounded} ${unit}`;
}

export function formatMoney(cents: number | null | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function categoryLabel(category: Category | string) {
  return category.replaceAll("_", " ");
}

export function locationLabel(location: Location | string) {
  return location;
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export type ExpiryTone = "none" | "ok" | "soon" | "today" | "overdue";

export function expiryTone(expiresAt: Date | string | null | undefined): ExpiryTone {
  if (!expiresAt) return "none";
  const date = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const days = daysFromNow(date);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "ok";
}
