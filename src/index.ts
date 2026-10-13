#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { READ, run } from "./helpers.js";
import { loadWorkspacesFromEnv, WorkspaceRegistry, createWorkspaceServer } from "./workspaces.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerLeadTools } from "./tools/leads.js";
import { registerLeadListTools } from "./tools/leadLists.js";
import { registerBlocklistTools } from "./tools/blocklist.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerOneboxTools } from "./tools/onebox.js";
import { registerInboxPlacementTools } from "./tools/inboxPlacement.js";
import { registerTagTools } from "./tools/tags.js";

const SERVER_NAME = "reachinbox";
const SERVER_VERSION = "0.2.0";

function buildRegistry(): WorkspaceRegistry {
  let config;
  try {
    config = loadWorkspacesFromEnv(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const rps = Number(process.env.REACHINBOX_REQUESTS_PER_SECOND ?? "5");
  return new WorkspaceRegistry(config, {
    baseUrl: process.env.REACHINBOX_BASE_URL,
    requestsPerSecond: Number.isFinite(rps) && rps > 0 ? rps : 5,
  });
}

async function main(): Promise<void> {
  const registry = buildRegistry();

  const filterNotes = registry.names
    .filter((n) => registry.accountFilter(n))
    .map((n) => `workspace "${n}" auto-filters email-account tools to addresses containing "${registry.accountFilter(n)}" (pass contains explicitly to override)`);
  const workspaceLine = [
    registry.isMulti
      ? `Configured workspaces: ${registry.names.join(", ")} (default "${registry.defaultName}"). Every tool accepts an optional "workspace" argument; call list_workspaces to see which ReachInbox workspace each name maps to.`
      : "A single workspace is configured.",
    ...filterNotes,
  ].join(" ");

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        "Tools for the ReachInbox cold-email platform.",
        workspaceLine,
        "Typical campaign setup: create_campaign -> set_campaign_sequences -> set_campaign_schedule -> set_campaign_accounts -> add_leads_to_campaign (or copy_leads_to_campaign) -> start_campaign.",
        "Launching needs nothing after start_campaign: do NOT call change_leads_state to \"resume\" leads. Leads show isPaused=true by default, and a newly started campaign can take a few hours to send its first email.",
        "Tools marked destructive (delete_*) cannot be undone; confirm with the user before calling them.",
        "start_campaign and send_onebox_reply send real emails.",
        "The API is rate-limited to 5 requests/second per key; the server queues calls automatically.",
      ].join("\n"),
    }
  );

  server.registerTool(
    "list_workspaces",
    {
      title: "List configured workspaces",
      description:
        "List the ReachInbox workspaces this server has API keys for, with each one's workspace ID, account email and plan. Use the returned name as the `workspace` argument on other tools.",
      inputSchema: {
        verify: z.boolean().optional().describe("true (default) to call ReachInbox for each key and return workspace IDs; false to only list names"),
      },
      annotations: READ,
    },
    async ({ verify }) =>
      run(async () => {
        const rows = [];
        for (const name of registry.names) {
          const row: Record<string, unknown> = { name, isDefault: name === registry.defaultName };
          const accountFilter = registry.accountFilter(name);
          if (accountFilter) row.accountFilter = accountFilter;
          if (verify !== false) {
            try {
              const res = await registry.resolve(name).get<{ data?: Record<string, unknown> }>("/api/v1/account");
              const d = res.data ?? {};
              Object.assign(row, {
                workspaceId: d.workspaceId,
                accountEmail: d.email,
                role: d.role,
                activePlan: d.activePlan,
                workspacesInAccount: d.workspacesCreated,
              });
            } catch (err) {
              row.error = err instanceof Error ? err.message : String(err);
            }
          }
          rows.push(row);
        }
        return { workspaces: rows };
      })
  );

  const toolServer = createWorkspaceServer(server, registry);
  const client = registry.routed;

  registerCampaignTools(toolServer, client);
  registerAnalyticsTools(toolServer, client);
  registerLeadTools(toolServer, client);
  registerLeadListTools(toolServer, client);
  registerBlocklistTools(toolServer, client);
  registerAccountTools(toolServer, client);
  registerOneboxTools(toolServer, client);
  registerInboxPlacementTools(toolServer, client);
  registerTagTools(toolServer, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel; all diagnostics go to stderr.
  console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} ready on stdio (workspaces: ${registry.names.join(", ")})`);
}

main().catch((err) => {
  console.error("Fatal error starting ReachInbox MCP server:", err);
  process.exit(1);
});
