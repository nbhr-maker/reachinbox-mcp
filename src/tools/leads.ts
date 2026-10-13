import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, WRITE_IDEMPOTENT, DESTRUCTIVE, run, compact, campaignId, leadRecord } from "../helpers.js";

const duplicates = z
  .array(z.unknown())
  .optional()
  .describe("Duplicate-handling configuration as accepted by ReachInbox (usually omitted)");

export function registerLeadTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "list_campaign_leads",
    {
      title: "List campaign leads",
      description: "List leads in a campaign with per-status counts and each lead's activity.",
      inputSchema: {
        campaignId,
        lastLead: z.string().optional().describe("Pagination cursor from a previous call (defaults to false)"),
      },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/leads", compact(args)))
  );

  server.registerTool(
    "get_lead_details",
    {
      title: "Get lead details",
      description: "Fetch a single lead in a campaign by email or lead ID, including activity history.",
      inputSchema: {
        campaignId,
        email: z.string().optional().describe("Lead email (provide this or id)"),
        id: z.string().optional().describe("Lead ID (provide this or email)"),
      },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/leads/details", compact(args)))
  );

  server.registerTool(
    "add_leads_to_campaign",
    {
      title: "Add leads to campaign",
      description:
        "Insert leads into a campaign. Each lead needs an email and may carry firstName, lastName and custom variables. List any new custom variable names in newCoreVariables so they can be used in sequences.",
      inputSchema: {
        campaignId,
        leads: z.array(leadRecord).min(1),
        newCoreVariables: z.array(z.string()).optional().describe('Custom attribute names, e.g. ["company","role"]'),
        duplicates,
      },
      annotations: WRITE,
    },
    async ({ campaignId, duplicates, ...rest }) =>
      run(() => client.post("/api/v1/leads/add", compact({ campaignId: String(campaignId), ...rest, duplicates: duplicates ?? [] })))
  );

  server.registerTool(
    "update_campaign_lead",
    {
      title: "Update campaign lead",
      description: "Update a lead's email, custom attributes and/or lead status (classification) within a campaign.",
      inputSchema: {
        campaignId,
        leadId: z.number().int().describe("Lead ID"),
        email: z.string().optional().describe("Lead email (required when changing attributes)"),
        attributes: z.record(z.string(), z.unknown()).optional().describe("Fields to set, e.g. {firstName, lastName, company}"),
        leadStatus: z.string().optional().describe('Lead classification, exact casing: "Lead", "Interested", "Not Interested", "Out of office", "Wrong person", "Meeting Booked", "Meeting Completed", "Closed"'),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.post("/api/v1/leads", compact(args)))
  );

  server.registerTool(
    "change_leads_state",
    {
      title: "Pause or resume leads",
      description:
        "Bulk pause (PAUSED) or resume (IN_PROCESS) leads in a campaign. Target specific leadsIds, or omit them to apply to all leads matching the filters. NOT part of launching a campaign: newly added leads show isPaused=true by default and start sending once the campaign is started (confirmed by ReachInbox support). Only use this to pause leads, or to resume leads that someone deliberately paused.",
      inputSchema: {
        campaignId,
        updatedStatus: z.enum(["PAUSED", "IN_PROCESS"]),
        leadsIds: z.array(z.number().int()).optional().describe("Specific lead IDs"),
        excludeLeadsIds: z.array(z.number().int()).optional().describe("Lead IDs to skip"),
        leadStatus: z.string().optional().describe('Filter by classification: "Lead", "Interested", "Not Interested", "Out of office", "Wrong person", "Meeting Booked", "Meeting Completed", "Closed"'),
        status: z.string().optional().describe("Filter by activity: links_clicked, emails_opened, email_replied, contacted, not_contacted, unsubscribed, bounced, completed, InSubsequence, paused, blocked, opened_not_replied, not_opened, not_replied, link_clicked_not_replied, google_mx, outlook_mx, others_mx"),
        contains: z.string().optional().describe("Filter by email substring"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ campaignId, ...rest }) =>
      run(() => client.post("/api/v1/leads/change-state", compact({ campaignId: String(campaignId), ...rest })))
  );

  server.registerTool(
    "delete_campaign_leads",
    {
      title: "Delete campaign leads",
      description:
        "Delete leads from a campaign. Pass leadIds to delete specific leads. An EMPTY leadIds array deletes every lead matching the filters (or all leads if no filters). Irreversible.",
      inputSchema: {
        campaignId,
        leadIds: z.array(z.number().int()).describe("Lead IDs to delete; [] means all matching"),
        exclude: z.array(z.number().int()).optional().describe("Lead IDs to keep"),
        status: z.string().optional().describe("Filter by activity: links_clicked, emails_opened, email_replied, bounced, unsubscribed, not_contacted, completed, interested, paused, blocked"),
        leadStatus: z.string().optional().describe('Filter by classification, e.g. "Interested"'),
        contains: z.string().optional().describe("Filter by email substring"),
      },
      annotations: DESTRUCTIVE,
    },
    async (args) => run(() => client.post("/api/v1/leads/delete", compact(args)))
  );
}
