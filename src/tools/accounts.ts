import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, WRITE_IDEMPOTENT, DESTRUCTIVE, run, compact, limit, offset, email, idsOrAll } from "../helpers.js";

const accountFilters = {
  status: z.string().optional().describe("Account status filter, e.g. all, wup_active, wup_paused"),
  contains: z.string().optional().describe("Filter by email substring"),
  filterTagId: z.string().optional().describe("Filter by tag ID"),
};

export function registerAccountTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "get_user_info",
    {
      title: "Get current user",
      description: "Return the authenticated user's profile, plan and workspace details.",
      annotations: READ,
    },
    async () => run(() => client.get("/api/v1/account"))
  );

  server.registerTool(
    "list_email_accounts",
    {
      title: "List email accounts",
      description: "List connected sending email accounts with totals, filterable by status/search and sortable.",
      inputSchema: {
        contains: z.string().optional().describe("Filter by email substring"),
        status: z.string().optional().describe("Filter by status"),
        sortField: z.string().optional().describe("e.g. warmup_health_score"),
        order: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (upper-case, per the API)"),
        limit,
        offset,
      },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/account/all", compact(args)))
  );

  server.registerTool(
    "get_email_account_info",
    {
      title: "Get email account overview",
      description: "Return an email account's details, campaign stats and DNS record status.",
      inputSchema: { emailId: z.number().int().describe("Email account ID") },
      annotations: READ,
    },
    async ({ emailId }) => run(() => client.get("/api/v1/account/get-info", { emailId }))
  );

  server.registerTool(
    "get_account_mailboxes",
    {
      title: "Get account mailboxes",
      description: "List the IMAP folders (path, name, message counts) of a connected email account.",
      inputSchema: { email },
      annotations: READ,
    },
    async ({ email }) => run(() => client.get(`/api/v1/account/get-mailboxes/${encodeURIComponent(email)}`))
  );

  server.registerTool(
    "check_dns",
    {
      title: "Check DNS records",
      description: "Verify SPF, DKIM and DMARC for one or more email accounts.",
      inputSchema: {
        accounts: z
          .array(
            z.object({
              email,
              type: z.string().describe('Account type, e.g. "oauth", "outlookOauth", "imapSingle"'),
              dkimSelector: z.string().optional().describe("Custom DKIM selector"),
            })
          )
          .min(1),
      },
      annotations: READ,
    },
    async ({ accounts }) => run(() => client.post("/api/v1/account/dns", { accounts }))
  );

  server.registerTool(
    "check_custom_domain_status",
    {
      title: "Check custom tracking domain",
      description: "Verify that a custom tracking domain's CNAME record is configured.",
      inputSchema: { domain: z.string().describe("Tracking domain, e.g. track.example.com") },
      annotations: READ,
    },
    async ({ domain }) => run(() => client.get("/api/v1/account/check-custom-domain-status", { domain }))
  );

  server.registerTool(
    "enable_warmup",
    {
      title: "Enable warmup",
      description: 'Start email warmup for specific account IDs or "ALL" accounts matching the filters.',
      inputSchema: {
        ids: idsOrAll,
        exclude: z.array(z.number().int()).optional().describe('Account IDs to skip when ids is "ALL"'),
        ...accountFilters,
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ ids, exclude, ...query }) =>
      run(() => client.post("/api/v1/account/warmup/enable", compact({ ids, exclude }), compact(query)))
  );

  server.registerTool(
    "pause_warmup",
    {
      title: "Pause warmup",
      description: 'Pause email warmup for specific account IDs or "ALL" accounts matching the filters.',
      inputSchema: {
        ids: idsOrAll,
        exclude: z.array(z.number().int()).optional().describe('Account IDs to skip when ids is "ALL"'),
        ...accountFilters,
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ ids, exclude, ...query }) =>
      run(() => client.post("/api/v1/account/warmup/pause", compact({ ids, exclude }), compact(query)))
  );

  server.registerTool(
    "update_email_account_options",
    {
      title: "Update email account options",
      description:
        'Update sending limits, delays, reply-to, signature, tracking domain and warmup settings for one, several, or "ALL" email accounts. Only provided fields change.',
      inputSchema: {
        id: idsOrAll,
        exclude: z.array(z.number().int()).optional().describe('Account IDs to skip when id is "ALL"'),
        status: z.string().optional().describe("Filter (with ALL): all, wup_active, wup_paused, ..."),
        contains: z.string().optional().describe("Filter (with ALL) by email substring"),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        limits: z.number().int().min(0).optional().describe("Daily sending limit"),
        minimumWaitTime: z.number().int().min(0).optional().describe("Wait time between emails (minutes)"),
        minimumDelayBetweenCampaignEmails: z.number().int().min(0).optional().describe("Minutes"),
        replyTo: z.string().optional().describe("Reply-to address"),
        signature: z.string().optional().describe("HTML signature"),
        trackingDomain: z.string().optional().describe("Custom tracking domain"),
        maxThreadCount: z.number().int().min(0).optional(),
        increasePerDay: z.number().int().min(0).optional().describe("Warmup ramp per day"),
        warmupLimit: z.number().int().min(0).optional().describe("Max warmup emails per day"),
        minimumWarmupLimit: z.number().int().min(0).optional(),
        warmupReplyRate: z.number().int().min(0).max(100).optional(),
        warmupOpenRate: z.number().int().min(0).max(100).optional(),
        warmupSpamProtectionRate: z.number().int().min(0).max(100).optional(),
        warmupMarkAsImportantRate: z.number().int().min(0).max(100).optional(),
        warmupTag: z.string().optional(),
        warmupDisableSlow: z.boolean().optional(),
        warmupOnWeekdays: z.boolean().optional(),
        moveWarmupEmails: z.boolean().optional(),
        warmupDestinationFolder: z.string().optional(),
        warmupIndustry: z.string().optional(),
        minimumDelayBetweenWarmupEmails: z.number().int().min(0).optional().describe("Minutes"),
        maximumDelayBetweenWarmupEmails: z.number().int().min(0).optional().describe("Minutes"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ status, contains, ...body }) =>
      run(() => client.post("/api/v1/account/update-account", compact(body), compact({ status, contains })))
  );

  server.registerTool(
    "get_oauth_connect_url",
    {
      title: "Get OAuth connect URL",
      description: "Generate the URL a user must open in a browser to connect a Google or Microsoft mailbox.",
      inputSchema: { type: z.enum(["oauth", "outlookOauth"]).describe('"oauth" = Google, "outlookOauth" = Microsoft') },
      annotations: WRITE,
    },
    async ({ type }) => run(() => client.post("/api/v1/account/get-oauth-url", { type }))
  );

  server.registerTool(
    "connect_imap_account",
    {
      title: "Connect IMAP/SMTP account",
      description:
        "Connect a mailbox using IMAP/SMTP credentials. Note: passwords passed here travel through the model context; prefer having the user connect via the ReachInbox dashboard when possible.",
      inputSchema: {
        firstName: z.string(),
        lastName: z.string(),
        email,
        smtpHost: z.string(),
        smtpPort: z.number().int(),
        smtpUsername: z.string(),
        smtpPassword: z.string(),
        imapHost: z.string(),
        imapPort: z.number().int(),
        imapUsername: z.string(),
        imapPassword: z.string(),
      },
      annotations: WRITE,
    },
    async (args) => run(() => client.post("/api/v1/account/create", { type: "imapSingle", ...args }))
  );

  server.registerTool(
    "update_imap_connection",
    {
      title: "Update IMAP/SMTP connection",
      description: "Update host, port, username or password for an existing IMAP/SMTP account. Only provided fields change.",
      inputSchema: {
        email,
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        imapHost: z.string().optional(),
        imapPort: z.number().int().optional(),
        imapUsername: z.string().optional(),
        imapPassword: z.string().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().int().optional(),
        smtpUsername: z.string().optional(),
        smtpPassword: z.string().optional(),
        isSmtpError: z.boolean().optional().describe("Set when fixing an SMTP error state"),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.post("/api/v1/account/update-connection", compact({ type: "imapSingle", ...args })))
  );

  server.registerTool(
    "delete_email_account",
    {
      title: "Delete email account",
      description: "Disconnect and delete a single email account by ID. Irreversible.",
      inputSchema: { id: z.number().int().describe("Email account ID") },
      annotations: DESTRUCTIVE,
    },
    async ({ id }) => run(() => client.delete(`/api/v1/account/${id}`))
  );

  server.registerTool(
    "delete_email_accounts",
    {
      title: "Delete multiple email accounts",
      description: "Disconnect and delete several email accounts by ID. Irreversible.",
      inputSchema: { ids: z.array(z.number().int()).min(1) },
      annotations: DESTRUCTIVE,
    },
    async ({ ids }) => run(() => client.delete("/api/v1/account", { body: { ids } }))
  );
}
