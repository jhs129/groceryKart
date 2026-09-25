import { z } from "zod";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { Caller } from "@/lib/domain/caller";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import {
  getOnHandLots,
  getExpiringLots,
  getOpenLists,
  getListWithItems,
  getReceipts,
  getReceiptWithLines,
  getRecipes,
} from "@/lib/db/queries";
import { addInventoryItem, adjustLotQuantity, markLotGone } from "@/lib/domain/inventory";
import { addListItem, toggleListItem, createShoppingList } from "@/lib/domain/lists";
import { confirmReceipt } from "@/lib/domain/receipts";
import { generateRecipes } from "@/lib/domain/recipes";
import { askAboutGroceries } from "@/lib/domain/ask";

/**
 * Thrown by `callerFromContext` when a tool call arrives without a valid,
 * verified `AuthInfo.extra` payload attached to THAT request's context.
 */
class McpCallerError extends Error {}

/**
 * Reconstructs the calling user's `Caller` from the per-request MCP
 * `ServerContext`. This must be called fresh, inside each tool callback's own
 * body, from the `ctx` that callback receives at call time — never hoisted
 * into a variable captured by the tool-registration closure. `ctx.http.authInfo`
 * is populated per request by `withMcpAuth`/`verifyMcpToken` (lib/mcp/auth.ts)
 * and is never shared across requests, so reading it here (rather than closing
 * over a `caller` resolved once when tools were registered) is what keeps one
 * caller's organization from leaking into another caller's tool calls.
 */
function callerFromContext(ctx: ServerContext): Caller {
  const extra = ctx.http?.authInfo?.extra;
  const userId = extra?.userId;
  const organizationId = extra?.organizationId;
  const role = extra?.role;
  if (
    typeof userId !== "string" ||
    typeof organizationId !== "string" ||
    (role !== "owner" && role !== "member")
  ) {
    throw new McpCallerError("Missing or invalid authentication context for this request.");
  }
  return { userId, organizationId, role };
}

function textResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Resolves the caller from `ctx` (fresh, per call) and runs `fn` with it,
 * converting known domain/auth errors into an MCP tool-error result instead
 * of letting them throw uncaught (R8).
 */
async function runTool(
  ctx: ServerContext,
  fn: (caller: Caller) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    const caller = callerFromContext(ctx);
    return await fn(caller);
  } catch (error) {
    if (
      error instanceof McpCallerError ||
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ValidationError
    ) {
      return errorResult(error.message);
    }
    console.error("MCP tool error:", error);
    return errorResult("Something went wrong handling this request.");
  }
}

export function registerGroceryTools(server: McpServer) {
  server.registerTool(
    "list_inventory",
    {
      description: "List all on-hand inventory lots for the active organization.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => runTool(ctx, async (caller) => textResult(await getOnHandLots(caller.organizationId))),
  );

  server.registerTool(
    "list_expiring_inventory",
    {
      description: "List inventory lots expiring within N days.",
      inputSchema: z.object({ withinDays: z.number().optional() }),
    },
    async ({ withinDays }, ctx) =>
      runTool(ctx, async (caller) =>
        textResult(await getExpiringLots(caller.organizationId, withinDays)),
      ),
  );

  server.registerTool(
    "add_inventory_item",
    {
      description: "Add an item to on-hand inventory.",
      inputSchema: z.object({
        name: z.string(),
        category: z.string().optional(),
        unit: z.string().optional(),
        location: z.string().optional(),
        perishable: z.boolean().optional(),
        quantity: z.number().optional(),
        expiresAt: z.string().optional(),
        notes: z.string().optional(),
        store: z.string().optional(),
      }),
    },
    async (input, ctx) =>
      runTool(ctx, async (caller) => {
        await addInventoryItem(caller, input);
        return textResult({ ok: true });
      }),
  );

  server.registerTool(
    "adjust_inventory_lot_quantity",
    {
      description: "Adjust the quantity of an inventory lot.",
      inputSchema: z.object({ lotId: z.string(), quantity: z.number() }),
    },
    async ({ lotId, quantity }, ctx) =>
      runTool(ctx, async (caller) => {
        await adjustLotQuantity(caller, lotId, quantity);
        return textResult({ ok: true });
      }),
  );

  server.registerTool(
    "mark_inventory_lot_gone",
    {
      description: "Mark an inventory lot as used up or discarded.",
      inputSchema: z.object({ lotId: z.string(), status: z.enum(["used_up", "discarded"]) }),
    },
    async ({ lotId, status }, ctx) =>
      runTool(ctx, async (caller) => {
        await markLotGone(caller, lotId, status);
        return textResult({ ok: true });
      }),
  );

  server.registerTool(
    "list_shopping_lists",
    {
      description: "List open shopping lists.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => runTool(ctx, async (caller) => textResult(await getOpenLists(caller.organizationId))),
  );

  server.registerTool(
    "get_shopping_list",
    {
      description: "Get a shopping list with its items.",
      inputSchema: z.object({ listId: z.string() }),
    },
    async ({ listId }, ctx) =>
      runTool(ctx, async (caller) => textResult(await getListWithItems(caller.organizationId, listId))),
  );

  server.registerTool(
    "create_shopping_list",
    {
      description: "Create a new shopping list.",
      inputSchema: z.object({ name: z.string() }),
    },
    async ({ name }, ctx) =>
      runTool(ctx, async (caller) => textResult({ id: await createShoppingList(caller, name) })),
  );

  server.registerTool(
    "add_shopping_list_item",
    {
      description: "Add an item to a shopping list (or the default list if none given).",
      inputSchema: z.object({
        name: z.string(),
        listId: z.string().optional(),
        quantity: z.number().optional(),
        unit: z.string().optional(),
      }),
    },
    async (input, ctx) =>
      runTool(ctx, async (caller) => {
        const listId = await addListItem(caller, input);
        return textResult({ listId });
      }),
  );

  server.registerTool(
    "toggle_shopping_list_item",
    {
      description: "Check or uncheck a shopping list item.",
      inputSchema: z.object({ itemId: z.string(), checked: z.boolean() }),
    },
    async ({ itemId, checked }, ctx) =>
      runTool(ctx, async (caller) => {
        await toggleListItem(caller, itemId, checked);
        return textResult({ ok: true });
      }),
  );

  server.registerTool(
    "list_receipts",
    {
      description: "List receipts.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => runTool(ctx, async (caller) => textResult(await getReceipts(caller.organizationId))),
  );

  server.registerTool(
    "get_receipt",
    {
      description: "Get a receipt with its line items.",
      inputSchema: z.object({ receiptId: z.string() }),
    },
    async ({ receiptId }, ctx) =>
      runTool(ctx, async (caller) => textResult(await getReceiptWithLines(caller.organizationId, receiptId))),
  );

  server.registerTool(
    "confirm_receipt",
    {
      description: "Confirm a receipt's parsed line items, recording purchases and optionally inventory.",
      inputSchema: z.object({
        store: z.string(),
        purchasedAt: z.string(),
        total: z.number().nullable(),
        items: z.array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string(),
            price: z.number().nullable(),
            category: z.string(),
            addToInventory: z.boolean(),
          }),
        ),
      }),
    },
    async (input, ctx) => runTool(ctx, async (caller) => textResult(await confirmReceipt(caller, input))),
  );

  server.registerTool(
    "list_recipes",
    {
      description: "List saved recipes.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => runTool(ctx, async (caller) => textResult(await getRecipes(caller.organizationId))),
  );

  server.registerTool(
    "generate_recipes",
    {
      description: "Generate recipe suggestions from on-hand inventory.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => runTool(ctx, async (caller) => textResult(await generateRecipes(caller))),
  );

  server.registerTool(
    "ask_about_groceries",
    {
      description: "Ask whether the household should currently have a given item.",
      inputSchema: z.object({ question: z.string() }),
    },
    async ({ question }, ctx) =>
      runTool(ctx, async (caller) => textResult(await askAboutGroceries(caller, question))),
  );
}
