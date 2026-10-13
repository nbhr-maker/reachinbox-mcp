import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ReachInboxError } from "./client.js";

/** What tool modules need from the server. The workspace router implements this to inject a `workspace` argument. */
export type ToolServer = Pick<McpServer, "registerTool">;

/** Standard annotation presets. */
export const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const WRITE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** Wraps a tool body: JSON-serialises the result, converts thrown errors into MCP error results. */
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }],
    };
  } catch (err) {
    return errorResult(err);
  }
}

export function errorResult(err: unknown): CallToolResult {
  let text: string;
  if (err instanceof ReachInboxError) {
    const detail = err.responseBody === null ? "" : `\n\nResponse body:\n${JSON.stringify(err.responseBody, null, 2)}`;
    text = `${err.message}${detail}`;
  } else if (err instanceof Error) {
    text = err.message;
  } else {
    text = String(err);
  }
  return { isError: true, content: [{ type: "text", text }] };
}

/** Drops undefined keys so optional params never reach the API as `undefined`. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// ---- Shared schema fragments -------------------------------------------------

export const campaignId = z.number().int().positive().describe("Numeric campaign ID");
export const limit = z.number().int().min(1).max(500).optional().describe("Max results to return");
export const offset = z.number().int().min(0).optional().describe("Number of results to skip (pagination)");
export const email = z.string().email();
export const idsOrAll = z
  .union([z.array(z.number().int()), z.literal("ALL")])
  .describe('Array of numeric IDs, or the string "ALL" to target every matching record');
/** Arbitrary lead attributes: email plus any custom variables. */
export const leadRecord = z
  .record(z.string(), z.unknown())
  .describe(
    'Lead object. Must include "email"; may include "firstName", "lastName", and any custom variable keys used in sequences (e.g. {"email":"a@b.com","firstName":"Ada","company":"Acme"})'
  );
