import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, WRITE_IDEMPOTENT, DESTRUCTIVE, run, compact, limit, offset } from "../helpers.js";

const testId = z.number().int().positive().describe("Inbox placement test ID");

export function registerInboxPlacementTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "list_inbox_placement_tests",
    {
      title: "List inbox placement tests",
      description: "List inbox placement (deliverability) tests with status/type filters, search, sorting and pagination.",
      inputSchema: {
        status: z.enum(["draft", "pending", "in_progress", "completed", "failed", "waiting_external"]).optional(),
        testType: z.enum(["manual_campaign", "manual_external", "automated"]).optional(),
        search: z.string().optional().describe("Search by test name"),
        sortBy: z.enum(["az", "za"]).optional(),
        limit,
        offset,
      },
      annotations: READ,
    },
    async (args) => run(() => client.get("/api/v1/inbox-placement/all", compact(args)))
  );

  server.registerTool(
    "get_inbox_placement_test",
    {
      title: "Get inbox placement test",
      description: "Return the full configuration of one test.",
      inputSchema: { testId },
      annotations: READ,
    },
    async ({ testId }) => run(() => client.get(`/api/v1/inbox-placement/details/${testId}`))
  );

  server.registerTool(
    "get_inbox_placement_results",
    {
      title: "Get inbox placement results",
      description: "Return per-seed results and summary analytics (inbox vs spam vs missing) for a test; for automated tests, the latest run.",
      inputSchema: { testId },
      annotations: READ,
    },
    async ({ testId }) => run(() => client.get(`/api/v1/inbox-placement/${testId}/results`))
  );

  server.registerTool(
    "create_inbox_placement_test",
    {
      title: "Create inbox placement test",
      description: "Create a new test in draft status. Configure it with update_inbox_placement_test, then start_inbox_placement_test.",
      inputSchema: { name: z.string().min(1), description: z.string().optional() },
      annotations: WRITE,
    },
    async (args) => run(() => client.post("/api/v1/inbox-placement/create", compact(args)))
  );

  server.registerTool(
    "update_inbox_placement_test",
    {
      title: "Configure inbox placement test",
      description:
        'Configure a draft (or paused automated) test. testType "manual_external": only seedFilters. "manual_campaign": campaign/step/variant, subject/body, sending email IDs, speed, tracking flags. "automated": manual_campaign fields plus schedule (repeatFrequency, timeOfDay, timezone, repeatDays, repeatEvery, monthlyRepeatDate, endDate, runImmediateTest, stopIfBelowPercent).',
      inputSchema: {
        testId,
        testType: z.enum(["manual_external", "manual_campaign", "automated"]),
        seedFilters: z.array(z.string()).optional().describe("Seed list filters"),
        campaignId: z.number().int().optional(),
        stepNumber: z.number().int().optional(),
        selectedVariantIndex: z.number().int().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        selectedSendingEmailIds: z.array(z.number().int()).optional(),
        sendingSpeed: z.string().optional(),
        minTimeGapMs: z.number().int().optional(),
        maxTimeGapMs: z.number().int().optional(),
        textOnly: z.boolean().optional(),
        linkTracking: z.boolean().optional(),
        openTracking: z.boolean().optional(),
        unsubscribeLinkHeader: z.boolean().optional(),
        repeatFrequency: z.string().optional().describe("e.g. daily, weekly, monthly"),
        timeOfDay: z.string().optional().describe("HH:MM"),
        timezone: z.string().optional().describe("IANA timezone"),
        runImmediateTest: z.boolean().optional(),
        stopIfBelowPercent: z.number().optional(),
        endDate: z.string().optional().describe("ISO date"),
        repeatDays: z.array(z.number().int()).optional(),
        repeatEvery: z.number().int().optional(),
        monthlyRepeatDate: z.number().int().optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ testId, ...body }) => run(() => client.put(`/api/v1/inbox-placement/update/${testId}/`, compact(body)))
  );

  server.registerTool(
    "start_inbox_placement_test",
    {
      title: "Start inbox placement test",
      description: "Start a configured draft test. This sends test emails from the selected accounts.",
      inputSchema: { testId },
      annotations: WRITE,
    },
    async ({ testId }) => run(() => client.post(`/api/v1/inbox-placement/${testId}/start`))
  );

  server.registerTool(
    "pause_automated_inbox_placement_test",
    {
      title: "Pause automated test",
      description: "Pause the schedule of a running automated test.",
      inputSchema: { testId },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ testId }) => run(() => client.post(`/api/v1/inbox-placement/automated/${testId}/pause`))
  );

  server.registerTool(
    "resume_automated_inbox_placement_test",
    {
      title: "Resume automated test",
      description: "Resume a paused automated test.",
      inputSchema: { testId },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ testId }) => run(() => client.post(`/api/v1/inbox-placement/automated/${testId}/resume`))
  );

  server.registerTool(
    "rename_inbox_placement_test",
    {
      title: "Rename inbox placement test",
      description: "Update a test's name and/or description.",
      inputSchema: { testId, name: z.string().optional(), description: z.string().optional() },
      annotations: WRITE_IDEMPOTENT,
    },
    async ({ testId, ...body }) => run(() => client.put(`/api/v1/inbox-placement/${testId}/rename`, compact(body)))
  );

  server.registerTool(
    "duplicate_inbox_placement_test",
    {
      title: "Duplicate inbox placement test",
      description: "Copy a test's configuration into a new draft test.",
      inputSchema: { testId, name: z.string().min(1) },
      annotations: WRITE,
    },
    async ({ testId, name }) => run(() => client.post(`/api/v1/inbox-placement/${testId}/duplicate`, { name }))
  );

  server.registerTool(
    "delete_inbox_placement_test",
    {
      title: "Delete inbox placement test",
      description: "Permanently delete a test and its results. Irreversible.",
      inputSchema: { testId },
      annotations: DESTRUCTIVE,
    },
    async ({ testId }) => run(() => client.delete(`/api/v1/inbox-placement/${testId}`))
  );
}
