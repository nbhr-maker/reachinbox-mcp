import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, WRITE_IDEMPOTENT, run, compact, limit, offset, email } from "../helpers.js";

export function registerOneboxTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "list_onebox_threads",
    {
      title: "List Onebox threads",
      description:
        "List email threads in the unified Onebox inbox. Filter by status/inbox, restrict or exclude campaigns and email accounts, or search with q.",
      inputSchema: {
        status: z.string().optional().describe('Thread status filter, e.g. "All"'),
        inbox: z.string().optional().describe('Inbox/folder filter, e.g. "Inbox"'),
        campaigns: z.array(z.number().int()).optional().describe("Only these campaign IDs"),
        excludeCampaigns: z.array(z.number().int()).optional(),
        emailIds: z.array(z.number().int()).optional().describe("Only these email account IDs"),
        excludeEmails: z.array(z.number().int()).optional(),
        q: z.string().optional().describe("Search query"),
        limit,
        offset,
      },
      annotations: READ,
    },
    async (args) => run(() => client.post("/api/v1/onebox/list", compact(args)))
  );

  server.registerTool(
    "get_onebox_thread",
    {
      title: "Get Onebox thread",
      description: "Return every message in a thread, given the account (email address) and thread ID from list_onebox_threads.",
      inputSchema: {
        account: z.string().describe("Email address of the account that owns the thread"),
        id: z.string().describe("Thread ID"),
      },
      annotations: READ,
    },
    async (args) => run(() => client.post("/api/v1/onebox/thread", args))
  );

  server.registerTool(
    "mark_onebox_all_read",
    {
      title: "Mark Onebox read",
      description: "Mark all Onebox threads as read, optionally limited to certain campaigns.",
      inputSchema: { campaigns: z.array(z.number().int()).optional().describe("Campaign IDs to limit to") },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args) => run(() => client.post("/api/v1/onebox/mark-all-read", compact(args)))
  );

  server.registerTool(
    "send_onebox_reply",
    {
      title: "Send Onebox reply",
      description:
        "Reply to an existing thread from Onebox. Get references, inReplyTo and originalMessageId from the message you are replying to via get_onebox_thread. Sends a real email.",
      inputSchema: {
        from: email.describe("Connected account to send from"),
        to: z.array(z.string()).min(1),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        subject: z.string(),
        body: z.string().describe("HTML body"),
        references: z.array(z.string()).describe("Message-ID references chain from the original message"),
        inReplyTo: z.string().describe("Message-ID being replied to"),
        originalMessageId: z.string().describe("ReachInbox message ID of the original message"),
      },
      annotations: WRITE,
    },
    async (args) =>
      run(() => {
        const form = new FormData();
        form.set("emaildata", JSON.stringify({ ...compact(args), cc: args.cc ?? [], bcc: args.bcc ?? [] }));
        return client.postForm("/api/v1/onebox/send", form);
      })
  );

  server.registerTool(
    "get_mailbox_messages",
    {
      title: "Get mailbox messages",
      description: "Fetch messages in real time from a specific IMAP folder of a connected account (folder paths from get_account_mailboxes).",
      inputSchema: {
        email,
        path: z.string().describe('IMAP folder path, e.g. "INBOX"'),
        page: z.number().int().min(0).optional().describe("Zero-based page index"),
        pageSize: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ,
    },
    async ({ email, ...query }) =>
      run(() => client.get(`/api/v1/onebox/get-messages/${encodeURIComponent(email)}`, compact(query)))
  );
}
