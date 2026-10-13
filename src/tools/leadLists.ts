import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, WRITE_IDEMPOTENT, DESTRUCTIVE, run, compact, campaignId, limit, offset, leadRecord } from "../helpers.js";

const leadsListId = z.number().int().positive().describe("Lead list ID");

export function registerLeadListTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "create_lead_list",
    {
      title: "Create lead list",
      description: "Create a new global lead list (reusable across campaigns).",
      inputSchema: { name: z.string().min(1) },
      annotations: WRITE,
    },
    async ({ name }) => run(() => client.post("/api/v1/lead-list/create", { name }))
  );

  server.registerTool(
    "list_lead_lists",
    {
      title: "List lead lists",
      description: "List lead lists with lead counts, with optional name search and pagination.",
      inputSchema: { contains: z.string().optional().describe("Name search"), limit, offset },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/lead-list/all", compact(args)))
  );

  server.registerTool(
    "get_lead_list",
    {
      title: "Get lead list",
      description: "Get a lead list's name and its core variables (columns).",
      inputSchema: { id: leadsListId },
      annotations: READ,
    },
    async ({ id }) => run(() => client.get("/api/v1/lead-list/details", { id }))
  );

  server.registerTool(
    "rename_lead_list",
    {
      title: "Rename lead list",
      description: "Rename a lead list.",
      inputSchema: { leadsListId, name: z.string().min(1) },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.put("/api/v1/lead-list/update", args))
  );

  server.registerTool(
    "delete_lead_list",
    {
      title: "Delete lead list",
      description: "Delete a lead list and every lead in it. Irreversible.",
      inputSchema: { leadsListId },
      annotations: DESTRUCTIVE,
    },
    async ({ leadsListId }) => run(() => client.delete("/api/v1/lead-list/delete", { query: { leadsListId } }))
  );

  server.registerTool(
    "add_leads_to_lead_list",
    {
      title: "Add leads to lead list",
      description:
        "Add leads to a lead list. Each lead needs an email and may carry firstName, lastName and custom fields. newCoreVariables lists the variable names available to sequences. The API ingests asynchronously and can DROP a batch that arrives while the previous one is still processing: send at most 100 leads per call and confirm the list's totalCount (get_lead_list_leads) has grown before sending the next batch.",
      inputSchema: {
        leadsListId,
        leads: z.array(leadRecord).min(1),
        newCoreVariables: z.array(z.string()).default([]).describe('Variable names present on the leads, e.g. ["firstName","company"]'),
        duplicates: z.array(z.unknown()).optional().describe("Duplicate-handling configuration (usually omitted)"),
      },
      annotations: WRITE,
    },
    async ({ duplicates, ...rest }) => run(() => client.post("/api/v1/lead-list/add-leads", compact({ ...rest, duplicates: duplicates ?? [] })))
  );

  server.registerTool(
    "get_lead_list_leads",
    {
      title: "Get leads from lead list",
      description: "Page through the leads in a lead list, with engagement analytics for the list.",
      inputSchema: {
        leadsListId,
        contains: z.string().optional().describe("Filter by email or name"),
        limit,
        offset,
      },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/lead-list/get-leads", compact(args)))
  );

  server.registerTool(
    "update_lead_list_lead",
    {
      title: "Update lead in lead list",
      description: "Update a lead's attributes inside a lead list.",
      inputSchema: {
        leadsListId,
        leadId: z.number().int(),
        attributes: z.record(z.string(), z.unknown()).describe("Fields to set, e.g. {firstName, lastName, company}"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.put("/api/v1/lead-list/update-lead", args))
  );

  server.registerTool(
    "delete_lead_list_leads",
    {
      title: "Delete leads from lead list",
      description: 'Delete specific leads (by ID) or every lead ("ALL", optionally excluding some) from a lead list. Irreversible.',
      inputSchema: {
        leadsListId,
        leadIds: z.union([z.array(z.number().int()), z.literal("ALL")]),
        excludeIds: z.array(z.number().int()).optional().describe('Lead IDs to keep when leadIds is "ALL"'),
      },
      annotations: DESTRUCTIVE,
    },
    async (args) => run(() => client.delete("/api/v1/lead-list/delete-leads", { body: compact(args) }))
  );

  server.registerTool(
    "copy_leads_to_campaign",
    {
      title: "Copy leads from lead list to campaign",
      description: "Copy all leads (or selected leadsIds) from a lead list into a campaign. Runs asynchronously on the ReachInbox side.",
      inputSchema: {
        campaignId,
        leadsListId,
        leadsIds: z.array(z.number().int()).optional().describe("Specific lead IDs; omit to copy the whole list"),
      },
      annotations: WRITE,
    },
    async (args) => run(() => client.post("/api/v1/lead-list/copy-leads-to-campaign", compact(args)))
  );
}
