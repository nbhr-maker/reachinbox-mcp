import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, WRITE_IDEMPOTENT, run, compact, campaignId, limit, offset, email } from "../helpers.js";

const variant = z.object({
  subject: z.string().describe("Email subject. Supports {{variables}} such as {{firstName}}"),
  body: z.string().describe("Email body (HTML or plain text). Supports {{variables}}"),
});

const step = z.object({
  type: z.enum(["initial", "follow-up"]).describe('"initial" for the first step, "follow-up" for later steps'),
  delay: z.number().int().min(0).describe("Days to wait AFTER this step before the NEXT step is sent (ReachInbox shows it as \"Wait For N day(s)\" under this step). For days 0/3/7 use delays 3,4,0. The last step's delay is ignored; use 0."),
  variants: z.array(variant).min(1).describe("One or more A/B variants for this step"),
  ccEnabled: z.boolean().optional().default(false),
  ccVariables: z.array(z.string()).optional().default([]).describe("CC addresses or variables"),
  bccEnabled: z.boolean().optional().default(false),
  bccVariables: z.array(z.string()).optional().default([]).describe("BCC addresses or variables"),
});

const sequence = z.object({
  steps: z.array(step).min(1),
});

const schedule = z.object({
  name: z.string().describe("Label for this schedule window"),
  timing: z.object({
    from: z.string().regex(/^\d{2}:\d{2}$/).describe("Start time, HH:MM 24h"),
    to: z.string().regex(/^\d{2}:\d{2}$/).describe("End time, HH:MM 24h"),
  }),
  days: z
    .record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.boolean())
    .describe('Days of week to send. Keys "0" (Sunday) through "6" (Saturday), values true/false'),
  timezone: z.string().describe('IANA timezone, e.g. "America/New_York"'),
});

export function registerCampaignTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "list_campaigns",
    {
      title: "List campaigns",
      description:
        "List campaigns in the workspace with optional search, status filter, tag filter, sorting and pagination.",
      inputSchema: {
        contains: z.string().optional().describe("Substring to search in campaign names"),
        filter: z
          .enum(["All", "Active", "Paused", "Draft", "Completed", "Offschedule"])
          .optional()
          .describe("Status filter"),
        filterTagId: z.union([z.string(), z.number()]).optional().describe("Only campaigns with this tag ID"),
        isArchived: z.boolean().optional().describe("true to list archived campaigns"),
        sort: z.string().optional().describe("Sort criteria as accepted by the ReachInbox UI"),
        limit,
        offset,
      },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/campaigns/all", compact(args)))
  );

  server.registerTool(
    "get_campaign_status",
    {
      title: "Get campaign status",
      description: "Return a campaign's status plus is_active and has_started flags.",
      inputSchema: { campaignId },
      annotations: READ,
    },
    async ({ campaignId }) => run(() => client.get("/api/v1/campaigns/status", { campaignId }))
  );

  server.registerTool(
    "get_campaign_name",
    {
      title: "Get campaign name",
      description: "Return the name of a campaign by ID.",
      inputSchema: { campaignId },
      annotations: READ,
    },
    async ({ campaignId }) => run(() => client.get("/api/v1/campaigns/name", { campaignId }))
  );

  server.registerTool(
    "get_campaign_accounts",
    {
      title: "Get campaign sending accounts",
      description: "List the sending email accounts attached to a campaign.",
      inputSchema: { campaignId },
      annotations: READ,
    },
    async ({ campaignId }) => run(() => client.get("/api/v1/campaigns/accounts", { campaignId }))
  );

  server.registerTool(
    "create_campaign",
    {
      title: "Create campaign",
      description:
        "Create a new campaign in Draft status with default settings. Follow up with set_campaign_sequences, set_campaign_schedule, set_campaign_accounts and add_leads_to_campaign, then start_campaign.",
      inputSchema: { name: z.string().min(1).describe("Campaign name") },
      annotations: WRITE,
    },
    async ({ name }) => run(() => client.post("/api/v1/campaigns/create", { name }))
  );

  server.registerTool(
    "duplicate_campaign",
    {
      title: "Duplicate campaign",
      description: "Create a copy of an existing campaign under a new name.",
      inputSchema: { campaignId, name: z.string().min(1).describe("Name for the copy") },
      annotations: WRITE,
    },
    async ({ campaignId, name }) => run(() => client.post("/api/v1/campaigns/duplicate", { campaignId, name }))
  );

  server.registerTool(
    "rename_campaign",
    {
      title: "Rename campaign",
      description: "Change a campaign's name.",
      inputSchema: { campaignId, name: z.string().min(1).describe("New campaign name") },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ campaignId, name }) =>
      run(() => client.put("/api/v1/campaigns/set-name", { campaignId: String(campaignId), name }))
  );

  server.registerTool(
    "set_campaign_sequences",
    {
      title: "Set campaign sequences",
      description:
        "Replace the email sequence(s) of a campaign. Each sequence has ordered steps; each step has one or more subject/body variants and a delay: the number of days to wait after THIS step before the next one (not before this step). Getting this wrong sends step 2 the same day as step 1. Use {{firstName}} style variables.",
      inputSchema: {
        campaignId,
        sequences: z.array(sequence).min(1).describe("Usually a single sequence with several steps"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ campaignId, sequences }) =>
      run(() => client.post("/api/v1/campaigns/add-sequence", { campaignId, sequences }))
  );

  server.registerTool(
    "set_campaign_schedule",
    {
      title: "Set campaign schedule",
      description: "Set the start/end dates and one or more sending windows (time range, weekdays, timezone) for a campaign.",
      inputSchema: {
        campaignId,
        startDate: z.string().describe("ISO 8601 datetime, e.g. 2025-01-01T00:00:00.000Z"),
        endDate: z.string().describe("ISO 8601 datetime"),
        schedules: z.array(schedule).min(1),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.put("/api/v1/campaigns/set-schedule", args))
  );

  server.registerTool(
    "update_campaign_options",
    {
      title: "Update campaign options",
      description:
        "Update campaign settings such as daily limit, open/link tracking, stop-on-reply, CC/BCC, unsubscribe header, delivery optimisations and bounce protection. Only provided fields are changed.",
      inputSchema: {
        campaignId,
        dailyLimit: z.number().int().min(0).optional().describe("Max emails per day"),
        tracking: z.boolean().optional().describe("Enable open tracking"),
        linkTracking: z.boolean().optional().describe("Enable link tracking"),
        stopOnReply: z.boolean().optional().describe("Stop sending to a lead when they reply"),
        stopOnDomainReply: z.boolean().optional().describe("Stop sending to every lead at a domain once anyone there replies"),
        deliveryOptimizations: z.number().int().min(0).max(2).optional().describe("0, 1 or 2"),
        blockquote: z.boolean().optional().describe("Quote previous message in follow-ups"),
        cc: z.array(z.string()).optional().describe("CC addresses"),
        bcc: z.array(z.string()).optional().describe("BCC addresses"),
        unsubscribeHeader: z.boolean().optional().describe("Include list-unsubscribe header/link"),
        globalUnsubscribe: z.boolean().optional().describe("Unsubscribes apply across all campaigns"),
        maxNewLeads: z.number().int().min(0).optional().describe("Max new leads contacted per day"),
        prioritizeNewLeads: z.boolean().optional(),
        automaticReschedule: z.number().int().min(0).nullable().optional().describe("Out-of-office reschedule delay in days; null to disable"),
        providerMatchingEnabled: z.number().int().min(0).max(2).optional().describe("0, 1 or 2"),
        targetLeadEsp: z.string().regex(/^[01]{3}$/).optional().describe('3-digit binary string, e.g. "111"'),
        bounceProtection: z.boolean().optional(),
        notificationEmail: z.string().optional().describe("Address to notify"),
        minimumExtraDelay: z.number().int().min(0).optional().describe("Minutes"),
        maximumExtraDelay: z.number().int().min(0).optional().describe("Minutes"),
        aiTimeGapsEnabled: z.boolean().optional(),
        prioritizeSubsequenceLeads: z.boolean().optional(),
        autoOptimizeAzMetric: z.enum(["REPLY_RATE", "OPEN_RATE", "CLICK_RATE"]).optional().describe("Metric used to auto-pick the winning A/Z variant"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.post("/api/v1/campaigns/update-details", compact(args)))
  );

  server.registerTool(
    "set_campaign_accounts",
    {
      title: "Set campaign sending accounts",
      description: "Replace the full set of sending email accounts used by a campaign.",
      inputSchema: {
        campaignId,
        accountsToUse: z.array(email).min(1).describe("Email addresses of connected sending accounts"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.put("/api/v1/campaigns/set-accounts", args))
  );

  server.registerTool(
    "add_emails_to_campaign",
    {
      title: "Add email accounts to campaign",
      description: "Add sending email addresses to a campaign without replacing the existing ones (ReachInbox add-email endpoint).",
      inputSchema: { campaignId, emails: z.array(email).min(1) },
      annotations: WRITE,
    },
    async (args) => run(() => client.post("/api/v1/campaigns/add-email", args))
  );

  server.registerTool(
    "remove_email_from_campaign",
    {
      title: "Remove email account from campaign",
      description: "Remove a single sending email address from a campaign.",
      inputSchema: { campaignId, email },
      annotations: WRITE,
    },
    async (args) => run(() => client.post("/api/v1/campaigns/remove-email", args))
  );

  server.registerTool(
    "start_campaign",
    {
      title: "Start campaign",
      description: "Activate a campaign so it begins sending according to its schedule. This sends real emails to leads.",
      inputSchema: { campaignId },
      annotations: WRITE,
    },
    async ({ campaignId }) => run(() => client.post("/api/v1/campaigns/start", { campaignId }))
  );

  server.registerTool(
    "pause_campaign",
    {
      title: "Pause campaign",
      description: "Pause an active campaign.",
      inputSchema: { campaignId },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ campaignId }) => run(() => client.post("/api/v1/campaigns/pause", { campaignId }))
  );

}
