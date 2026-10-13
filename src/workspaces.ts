/**
 * Multi-workspace support.
 *
 * ReachInbox API keys are scoped to a single workspace and the API offers no way to
 * switch workspaces on a request. So the server accepts one key per workspace:
 *
 *   REACHINBOX_API_KEY            -> workspace "default"
 *   REACHINBOX_API_KEY_<NAME>     -> workspace "<name>" (lower-cased, "_" becomes "-")
 *   REACHINBOX_DEFAULT_WORKSPACE  -> which name to use when a tool call omits `workspace`
 *   REACHINBOX_ACCOUNT_FILTER_<NAME> -> keyword auto-applied as `contains` on account endpoints
 *                                       for that workspace (for shared workspaces holding several brands)
 *
 * When more than one workspace is configured every tool gains an optional `workspace`
 * argument. The active client is carried through AsyncLocalStorage so tool modules
 * keep using a single `ApiClient` without knowing about routing.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReachInboxClient, type ApiClient, type ReachInboxClientOptions } from "./client.js";
import type { ToolServer } from "./helpers.js";

export interface WorkspaceConfig {
  name: string;
  apiKey: string;
  /** Keyword auto-applied as the `contains` filter on account endpoints. */
  accountFilter?: string;
}

export interface WorkspaceEnvConfig {
  workspaces: WorkspaceConfig[];
  defaultName: string;
}

export function loadWorkspacesFromEnv(env: NodeJS.ProcessEnv): WorkspaceEnvConfig {
  const workspaces: WorkspaceConfig[] = [];
  const base = env.REACHINBOX_API_KEY?.trim();
  if (base) workspaces.push({ name: "default", apiKey: base });

  for (const [key, value] of Object.entries(env)) {
    const match = /^REACHINBOX_API_KEY_(.+)$/.exec(key);
    const apiKey = value?.trim();
    if (!match || !apiKey) continue;
    const name = match[1].toLowerCase().replace(/_/g, "-");
    if (workspaces.some((w) => w.name === name)) {
      throw new Error(`Duplicate workspace name "${name}" from ${key}`);
    }
    workspaces.push({ name, apiKey });
  }

  for (const [key, value] of Object.entries(env)) {
    const match = /^REACHINBOX_ACCOUNT_FILTER_(.+)$/.exec(key);
    const keyword = value?.trim();
    if (!match || !keyword) continue;
    const name = match[1].toLowerCase().replace(/_/g, "-");
    const ws = workspaces.find((w) => w.name === name);
    if (!ws) {
      throw new Error(`${key} refers to workspace "${name}" but no REACHINBOX_API_KEY_${match[1]} is set`);
    }
    ws.accountFilter = keyword;
  }

  if (workspaces.length === 0) {
    throw new Error(
      "No ReachInbox API key configured. Set REACHINBOX_API_KEY, or one REACHINBOX_API_KEY_<NAME> per workspace (keys are created per workspace in Dashboard -> Settings -> Integrations -> API)."
    );
  }

  const requested = env.REACHINBOX_DEFAULT_WORKSPACE?.trim().toLowerCase().replace(/_/g, "-");
  let defaultName = workspaces[0].name;
  if (requested) {
    if (!workspaces.some((w) => w.name === requested)) {
      throw new Error(
        `REACHINBOX_DEFAULT_WORKSPACE="${requested}" does not match a configured workspace (${workspaces.map((w) => w.name).join(", ")})`
      );
    }
    defaultName = requested;
  }

  return { workspaces, defaultName };
}

export class WorkspaceRegistry {
  private readonly clients = new Map<string, ReachInboxClient>();
  private readonly als = new AsyncLocalStorage<ReachInboxClient>();
  readonly defaultName: string;

  /** ApiClient facade that routes to the workspace active in the current async context. */
  readonly routed: ApiClient = {
    get: (path, query) => this.current().get(path, query),
    post: (path, body, query) => this.current().post(path, body, query),
    postForm: (path, form, query) => this.current().postForm(path, form, query),
    put: (path, body, query) => this.current().put(path, body, query),
    delete: (path, opts) => this.current().delete(path, opts),
  };

  constructor(config: WorkspaceEnvConfig, clientOpts: Omit<ReachInboxClientOptions, "apiKey" | "accountFilter">) {
    for (const ws of config.workspaces) {
      this.clients.set(ws.name, new ReachInboxClient({ ...clientOpts, apiKey: ws.apiKey, accountFilter: ws.accountFilter }));
    }
    this.defaultName = config.defaultName;
  }

  get names(): string[] {
    return [...this.clients.keys()];
  }

  /** Account filter keyword for a workspace, if configured. */
  accountFilter(name: string): string | undefined {
    return this.clients.get(name)?.accountFilter;
  }

  get isMulti(): boolean {
    return this.clients.size > 1;
  }

  resolve(name?: string): ReachInboxClient {
    const key = name ?? this.defaultName;
    const client = this.clients.get(key);
    if (!client) {
      throw new Error(`Unknown workspace "${key}". Configured workspaces: ${this.names.join(", ")}`);
    }
    return client;
  }

  runWith<T>(name: string | undefined, fn: () => T): T {
    return this.als.run(this.resolve(name), fn);
  }

  private current(): ReachInboxClient {
    return this.als.getStore() ?? this.resolve(undefined);
  }
}

/**
 * Wraps an McpServer so that every registered tool receives an optional `workspace`
 * argument (only when more than one workspace is configured) and runs with that
 * workspace's client bound in async context.
 */
export function createWorkspaceServer(server: McpServer, registry: WorkspaceRegistry): ToolServer {
  if (!registry.isMulti) {
    return server;
  }

  const names = registry.names as [string, ...string[]];
  const workspaceSchema = z
    .enum(names)
    .optional()
    .describe(`ReachInbox workspace to operate on: ${names.join(" | ")}. Defaults to "${registry.defaultName}".`);

  const registerTool = (name: string, config: Record<string, unknown>, cb: (...a: unknown[]) => unknown) => {
    const inputSchema = { ...((config.inputSchema as Record<string, unknown> | undefined) ?? {}), workspace: workspaceSchema };
    const wrapped = (args: Record<string, unknown>, extra: unknown) => {
      const { workspace, ...rest } = args;
      return registry.runWith(workspace as string | undefined, () => cb(rest, extra));
    };
    return (server.registerTool as unknown as (n: string, c: unknown, f: unknown) => unknown)(
      name,
      { ...config, inputSchema },
      wrapped
    );
  };

  return { registerTool } as unknown as ToolServer;
}
