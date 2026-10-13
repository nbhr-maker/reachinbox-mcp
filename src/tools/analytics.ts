import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, run, compact, campaignId } from "../helpers.js";

const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

export function registerAnalyticsTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "get_campaign_analytics",
    {
      title: "Get campaign analytics",
      description:
        "Return sent/opened/clicked/replied/bounced counts, rates and a per-day breakdown for one campaign over a date range.",
      inputSchema: {
        campaignId,
        startDate: dateYmd,
        endDate: dateYmd,
        includeSubsequenceIds: z.array(z.number().int()).optional().describe("Only include these subsequence IDs"),
        excludeSubsequenceIds: z.array(z.number().int()).optional().describe("Exclude these subsequence IDs"),
        filter: z.string().optional().describe('Optional filter, e.g. "none"'),
      },
      annotations: READ,
    },
    async ({ startDate, endDate, ...body }) =>
      run(() =>
        client.post("/api/v1/analytics", { campaignAnalyticsRequired: true, includeSubsequenceIds: [], excludeSubsequenceIds: [], filter: "none", ...compact(body) }, { startDate, endDate })
      )
  );

  server.registerTool(
    "get_analytics_summary",
    {
      title: "Get analytics summary",
      description:
        "Return aggregated analytics across all campaigns (or a chosen subset) for a date range, with a daily series and per-campaign data.",
      inputSchema: {
        startDate: dateYmd,
        endDate: dateYmd,
        campaignIds: z.array(z.number().int()).optional().describe("Restrict to these campaign IDs"),
        excludeIds: z.array(z.number().int()).optional().describe("Exclude these campaign IDs"),
      },
      annotations: READ,
    },
    async ({ startDate, endDate, ...body }) =>
      run(() => client.post("/api/v1/analytics/summary", compact(body), { startDate, endDate }))
  );

  server.registerTool(
    "get_warmup_analytics",
    {
      title: "Get warmup analytics",
      description:
        "Return the last 7 days of warmup metrics (warmup emails sent, landed in inbox vs spam, health score) for one email account or all accounts.",
      inputSchema: {
        ecId: z.number().int().optional().describe("Email account ID. Omit for all accounts"),
      },
      annotations: READ,
    },
    async ({ ecId }) => run(() => client.get("/api/v1/analytics/warmup-analytics", compact({ ecId })))
  );
}
