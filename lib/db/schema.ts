import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull().unique(),
    category: text("category").notNull().default("other"),
    defaultUnit: text("default_unit").notNull().default("each"),
    typicalShelfLifeDays: integer("typical_shelf_life_days"),
    perishable: boolean("perishable").notNull().default(false),
    defaultLocation: text("default_location").notNull().default("pantry"),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("items_category_idx").on(table.category)],
);

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  store: text("store").notNull().default("Unknown store"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  totalCents: integer("total_cents"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    rawName: text("raw_name").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("each"),
    priceCents: integer("price_cents"),
    category: text("category"),
    addedToInventory: boolean("added_to_inventory").notNull().default(false),
  },
  (table) => [index("receipt_lines_receipt_idx").on(table.receiptId)],
);

export const inventoryLots = pgTable(
  "inventory_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("each"),
    location: text("location").notNull().default("pantry"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    receiptId: uuid("receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("on_hand"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("lots_status_idx").on(table.status),
    index("lots_expires_idx").on(table.expiresAt),
    index("lots_item_idx").on(table.itemId),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("each"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    store: text("store"),
    receiptId: uuid("receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),
    rawName: text("raw_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("purchases_item_idx").on(table.itemId),
    index("purchases_bought_idx").on(table.purchasedAt),
  ],
);

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listId: uuid("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("each"),
    checked: boolean("checked").notNull().default(false),
    reason: text("reason").notNull().default("manual"),
  },
  (table) => [index("list_items_list_idx").on(table.listId)],
);

export const recipes = pgTable("recipes", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  servings: integer("servings").notNull().default(2),
  instructions: text("instructions").notNull(),
  source: text("source").notNull().default("ai"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: real("quantity"),
    unit: text("unit"),
    onHand: boolean("on_hand").notNull().default(false),
  },
  (table) => [index("recipe_ingredients_recipe_idx").on(table.recipeId)],
);

export const itemsRelations = relations(items, ({ many }) => ({
  lots: many(inventoryLots),
  purchases: many(purchases),
  receiptLines: many(receiptLines),
}));

export const inventoryLotsRelations = relations(inventoryLots, ({ one }) => ({
  item: one(items, {
    fields: [inventoryLots.itemId],
    references: [items.id],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  item: one(items, {
    fields: [purchases.itemId],
    references: [items.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ many }) => ({
  lines: many(receiptLines),
}));

export const receiptLinesRelations = relations(receiptLines, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptLines.receiptId],
    references: [receipts.id],
  }),
  item: one(items, {
    fields: [receiptLines.itemId],
    references: [items.id],
  }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ many }) => ({
  items: many(shoppingListItems),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingListItems.listId],
    references: [shoppingLists.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
}));
