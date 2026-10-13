import { z } from "zod";
import type { ApiClient } from "../client.js";
import { type ToolServer, READ, WRITE, run, campaignId } from "../helpers.js";

const tagInput = z.object({
  tag_name: z.string().min(1),
  tag_desc: z.string().optional(),
});

export function registerTagTools(server: ToolServer, client: ApiClient): void {
  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "List all custom tags in the workspace.",
      annotations: READ,
    },
    async () => run(() => client.get("/api/v1/others/get-all-tags"))
  );

  server.registerTool(
    "create_tags",
    {
      title: "Create tags",
      description: "Create one or more custom tags.",
      inputSchema: { tags: z.array(tagInput).min(1) },
      annotations: WRITE,
    },
    async ({ tags }) => run(() => client.post("/api/v1/others/create-tag", { tags }))
  );

  server.registerTool(
    "add_tag_to_campaign",
    {
      title: "Add tag to campaign",
      description: "Attach a tag (by name; created if missing) to a campaign.",
      inputSchema: { campaignId, tagName: z.string().min(1) },
      annotations: WRITE,
    },
    async ({ campaignId, tagName }) =>
      run(() => client.post("/api/v1/others/add-tag-campaign", { campaignId: String(campaignId), tags: [{ tag_name: tagName }] }))
  );

  server.registerTool(
    "remove_tag_from_campaign",
    {
      title: "Remove tag from campaign",
      description: "Detach a tag (by tag ID) from a campaign.",
      inputSchema: { campaignId, tagId: z.number().int() },
      annotations: WRITE,
    },
    async ({ campaignId, tagId }) =>
      run(() => client.post("/api/v1/others/remove-tag-campaign", { campaignId: String(campaignId), tag_id: tagId }))
  );

  server.registerTool(
    "add_tag_to_emails",
    {
      title: "Add tag to email accounts",
      description: "Attach a tag (by name; created if missing) to one or more email accounts.",
      inputSchema: { emailIds: z.array(z.number().int()).min(1).describe("Email account IDs"), tagName: z.string().min(1) },
      annotations: WRITE,
    },
    async ({ emailIds, tagName }) =>
      run(() => client.post("/api/v1/others/add-tag-email", { emailIds: emailIds.map(String), tags: [{ tag_name: tagName }] }))
  );

  server.registerTool(
    "remove_tag_from_emails",
    {
      title: "Remove tag from email accounts",
      description: "Detach a tag (by tag ID) from one or more email accounts.",
      inputSchema: { emailIds: z.array(z.number().int()).min(1).describe("Email account IDs"), tagId: z.number().int() },
      annotations: WRITE,
    },
    async ({ emailIds, tagId }) => run(() => client.post("/api/v1/others/remove-tag-email", { emailIds: emailIds.map(String), tag_id: tagId }))
  );
}
