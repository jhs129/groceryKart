export const openApiSpec = {
  openapi: "3.1.0",
  info: { title: "GroceryKart API", version: "1.0.0" },
  servers: [{ url: "/api" }],
  paths: {
    "/inventory": {
      get: { summary: "List on-hand inventory lots", responses: { "200": { description: "OK" } } },
      post: { summary: "Add an inventory item", responses: { "201": { description: "Created" } } },
    },
    "/inventory/{lotId}": {
      patch: {
        summary: "Adjust or close out an inventory lot",
        parameters: [{ name: "lotId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/lists": {
      get: { summary: "List open shopping lists", responses: { "200": { description: "OK" } } },
      post: { summary: "Create a shopping list", responses: { "201": { description: "Created" } } },
    },
    "/lists/{listId}": {
      get: {
        summary: "Get a shopping list with items",
        parameters: [{ name: "listId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/lists/{listId}/items": {
      post: {
        summary: "Add an item to a shopping list",
        parameters: [{ name: "listId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Created" } },
      },
      patch: {
        summary: "Check/uncheck a shopping list item",
        parameters: [{ name: "listId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/receipts": {
      get: { summary: "List receipts", responses: { "200": { description: "OK" } } },
      post: { summary: "Confirm a parsed receipt", responses: { "201": { description: "Created" } } },
    },
    "/receipts/{receiptId}": {
      get: {
        summary: "Get a receipt with its lines",
        parameters: [{ name: "receiptId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/recipes": {
      get: { summary: "List saved recipes", responses: { "200": { description: "OK" } } },
      post: { summary: "Generate recipes from on-hand inventory", responses: { "201": { description: "Created" } } },
    },
    "/ask": {
      post: { summary: "Ask whether the house should have an item", responses: { "200": { description: "OK" } } },
    },
    "/organizations": {
      patch: { summary: "Rename the active organization", responses: { "200": { description: "OK" } } },
    },
    "/organizations/members": {
      get: { summary: "List organization members", responses: { "200": { description: "OK" } } },
      delete: { summary: "Remove a member (owner only)", responses: { "200": { description: "OK" } } },
    },
    "/organizations/switch": {
      post: { summary: "Switch active organization", responses: { "200": { description: "OK" } } },
    },
  },
  components: {
    securitySchemes: {
      oauth2: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "/api/oauth/authorize",
            tokenUrl: "/api/oauth/token",
            scopes: { full: "Full access to your organization's data" },
          },
        },
      },
    },
  },
  security: [{ oauth2: ["full"] }],
};
