import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, DESTRUCTIVE, run, compact, limit, offset } from "../helpers.js";

const table = z
  .string()
  .describe('Blocklist table name. Documented example is "keyword"; other tables correspond to the add_to_blocklist categories (emails, domains, replies keywords)');

export function registerBlocklistTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "add_to_blocklist",
    {
      title: "Add to blocklist",
      description: "Add email addresses, domains, subject/body keywords and reply keywords to the workspace blocklist. Any combination may be supplied.",
      inputSchema: {
        emails: z.array(z.string()).optional(),
        domains: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional().describe("Block outbound emails containing these keywords"),
        repliesKeywords: z.array(z.string()).optional().describe("Treat replies containing these keywords as blocked"),
      },
      annotations: WRITE,
    },
    async (args) => run(() => client.post("/api/v1/blocklist/add", compact(args)))
  );

  server.registerTool(
    "get_blocklist",
    {
      title: "Get blocklist",
      description: "Page through the entries of one blocklist table, optionally filtered by a search query.",
      inputSchema: { table, q: z.string().optional().describe("Search filter"), limit, offset },
      annotations: READ,
    },
    async ({ table, ...query }) => run(() => client.get(`/api/v1/blocklist/${encodeURIComponent(table)}`, compact(query)))
  );

  server.registerTool(
    "delete_from_blocklist",
    {
      title: "Delete from blocklist",
      description: "Remove entries (by ID, as returned by get_blocklist) from a blocklist table.",
      inputSchema: { table, ids: z.array(z.number().int()).min(1) },
      annotations: DESTRUCTIVE,
    },
    async ({ table, ids }) => run(() => client.delete(`/api/v1/blocklist/${encodeURIComponent(table)}`, { body: { ids } }))
  );
}
