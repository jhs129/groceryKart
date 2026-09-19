export const CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "seafood",
  "bakery",
  "pantry",
  "frozen",
  "beverages",
  "snacks",
  "household",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const LOCATIONS = ["fridge", "freezer", "pantry", "counter"] as const;
export type Location = (typeof LOCATIONS)[number];

export const UNITS = [
  "each",
  "dozen",
  "lb",
  "oz",
  "gal",
  "qt",
  "pint",
  "cup",
  "bunch",
  "pack",
  "loaf",
  "bag",
  "can",
  "jar",
  "bottle",
  "g",
  "kg",
  "ml",
  "l",
] as const;

export type Unit = (typeof UNITS)[number];

export const LOT_STATUSES = ["on_hand", "used_up", "discarded"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];
