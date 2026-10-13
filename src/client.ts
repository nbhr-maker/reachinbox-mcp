/**
 * Thin HTTP client for the ReachInbox REST API.
 *
 * - Bearer auth via API key
 * - Client-side rate limiting (ReachInbox allows 5 requests/second)
 * - Automatic retry with backoff on 429 and transient 5xx
 * - Normalised error type carrying HTTP status and response body
 */

export interface ReachInboxClientOptions {
  apiKey: string;
  baseUrl?: string;
  requestsPerSecond?: number;
  maxRetries?: number;
  /**
   * Keyword automatically applied as the `contains` filter on account-level endpoints
   * (list accounts, warmup enable/pause, bulk account update) when the caller does not
   * supply one. Used when a workspace holds accounts for several brands.
   */
  accountFilter?: string;
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  query?: Query;
  /** JSON body. Ignored when `form` is set. */
  body?: unknown;
  /** multipart/form-data body. */
  form?: FormData;
}

export class ReachInboxError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly responseBody: unknown
  ) {
    super(message);
    this.name = "ReachInboxError";
  }
}

/** Serialises calls so that at most `rps` requests start per second. */
class RateLimiter {
  private nextSlot = 0;
  private readonly intervalMs: number;

  constructor(rps: number) {
    this.intervalMs = 1000 / Math.max(rps, 0.1);
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + this.intervalMs;
    const wait = start - now;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The subset of the client that tool modules use. Implemented by ReachInboxClient and by the workspace router. */
export interface ApiClient {
  get<T = unknown>(path: string, query?: Query): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T>;
  postForm<T = unknown>(path: string, form: FormData, query?: Query): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T>;
  delete<T = unknown>(path: string, opts?: { body?: unknown; query?: Query }): Promise<T>;
}

export class ReachInboxClient implements ApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;
  readonly accountFilter?: string;

  /** Endpoints whose `contains` query param filters by email account. */
  private static readonly ACCOUNT_FILTERED_PATHS = new Set([
    "/api/v1/account/all",
    "/api/v1/account/warmup/enable",
    "/api/v1/account/warmup/pause",
    "/api/v1/account/update-account",
  ]);

  constructor(opts: ReachInboxClientOptions) {
    if (!opts.apiKey) {
      throw new Error("ReachInbox API key is required");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.reachinbox.ai").replace(/\/+$/, "");
    this.limiter = new RateLimiter(opts.requestsPerSecond ?? 5);
    this.maxRetries = opts.maxRetries ?? 2;
    this.accountFilter = opts.accountFilter?.trim() || undefined;
  }

  get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }

  postForm<T = unknown>(path: string, form: FormData, query?: Query): Promise<T> {
    return this.request<T>("POST", path, { form, query });
  }

  put<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("PUT", path, { body, query });
  }

  delete<T = unknown>(path: string, opts: { body?: unknown; query?: Query } = {}): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    let query = opts.query;
    let filterApplied = false;
    if (this.accountFilter && ReachInboxClient.ACCOUNT_FILTERED_PATHS.has(path)) {
      const existing = query?.contains;
      if (existing === undefined || existing === null || existing === "") {
        query = { ...(query ?? {}), contains: this.accountFilter };
        filterApplied = true;
      }
    }
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };

    let bodyInit: RequestInit["body"] | undefined;
    if (opts.form) {
      bodyInit = opts.form;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyInit = JSON.stringify(opts.body);
    }

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.limiter.acquire();

      let response: Response;
      try {
        response = await fetch(url, { method, headers, body: bodyInit });
      } catch (err) {
        if (attempt < this.maxRetries) {
          attempt += 1;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new ReachInboxError(`Network error calling ${method} ${path}: ${message}`, 0, method, path, null);
      }

      const parsed = await parseBody(response);

      if (response.ok) {
        return (filterApplied ? annotateFilter(parsed, this.accountFilter!) : parsed) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        attempt += 1;
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      throw new ReachInboxError(
        `ReachInbox API ${method} ${path} failed with HTTP ${response.status}: ${extractMessage(parsed)}`,
        response.status,
        method,
        path,
        parsed
      );
    }
  }

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

/** Tags a filtered account response so callers can see the implicit filter that was applied. */
function annotateFilter(body: unknown, keyword: string): unknown {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const data = record.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { ...record, data: { ...(data as Record<string, unknown>), appliedAccountFilter: keyword } };
    }
    return { ...record, appliedAccountFilter: keyword };
  }
  return body;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error", "msg"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return JSON.stringify(body);
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 500);
  return "no response body";
}
