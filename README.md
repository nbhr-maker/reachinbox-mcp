# ReachInbox MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
[ReachInbox](https://reachinbox.ai) cold-email API as tools, so Claude (or any MCP client)
can manage campaigns, leads, sending accounts, the Onebox inbox, analytics, blocklists,
tags and inbox-placement tests.

Covers every endpoint in the [ReachInbox API docs](https://docs.reachinbox.ai/) as of
September 2026: 74 tools across 9 resource groups, with support for multiple workspaces.

## Requirements

- Node.js 20 or newer
- A ReachInbox API key: **Dashboard → Settings → Integrations → API**

## Install

```bash
npm install
npm run build
```

## Configure

The server reads its configuration from environment variables:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `REACHINBOX_API_KEY` | one of these | | API key; registered as workspace `default` |
| `REACHINBOX_API_KEY_<NAME>` | one of these | | API key for workspace `<name>` (lower-cased, `_` becomes `-`). Repeat per workspace |
| `REACHINBOX_DEFAULT_WORKSPACE` | no | first configured | Workspace used when a tool call omits `workspace` |
| `REACHINBOX_ACCOUNT_FILTER_<NAME>` | no | | Keyword auto-applied as `contains` on email-account tools for workspace `<name>` |
| `REACHINBOX_BASE_URL` | no | `https://api.reachinbox.ai` | Override for testing/proxies |
| `REACHINBOX_REQUESTS_PER_SECOND` | no | `5` | Client-side rate limit per key (ReachInbox allows 5/s) |

### Multiple workspaces

ReachInbox API keys are scoped to a single workspace, and the API has no way to switch
workspaces per request. To work across workspaces, create a key inside each one
(switch workspace in the dashboard, then Settings → Integrations → API) and configure one
variable per workspace:

```json
"env": {
  "REACHINBOX_API_KEY_AGENCY": "key-from-agency-workspace",
  "REACHINBOX_API_KEY_SAAS": "key-from-saas-workspace",
  "REACHINBOX_API_KEY_TESTING": "key-from-testing-workspace",
  "REACHINBOX_DEFAULT_WORKSPACE": "agency"
}
```

With more than one key configured, every tool gains an optional `workspace` argument
(`"agency"`, `"saas"`, `"testing"` in the example) and `list_workspaces` reports which
ReachInbox workspace ID each name maps to. With a single key nothing changes.

### Shared workspace with several brands

If one workspace (typically the primary "My Workspace") holds email accounts for several
brands, set `REACHINBOX_ACCOUNT_FILTER_<NAME>` to a keyword. The server then passes it as
the `contains` filter on `list_email_accounts`, `enable_warmup`, `pause_warmup` and
`update_email_account_options` whenever the caller doesn't supply `contains`, and tags the
response with `appliedAccountFilter`. This keeps bulk operations (`ids: "ALL"`) scoped to
that brand's accounts. Pass `contains` explicitly to override. Note the API's `totalCount`
still reflects the unfiltered workspace.

### Claude Code

A project-level `.mcp.json` is included. Export your key and start Claude Code in this directory:

```bash
export REACHINBOX_API_KEY=your_key_here
```

Or register it globally:

```bash
claude mcp add reachinbox -e REACHINBOX_API_KEY=your_key_here -- node "/absolute/path/to/ReachInbox MCP/dist/index.js"
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reachinbox": {
      "command": "node",
      "args": ["/absolute/path/to/ReachInbox MCP/dist/index.js"],
      "env": { "REACHINBOX_API_KEY": "your_key_here" }
    }
  }
}
```

### Any other MCP client

Run `node dist/index.js` with `REACHINBOX_API_KEY` set; the server speaks MCP over stdio.

## Tools

### Workspaces
| Tool | Endpoint |
|---|---|
| `list_workspaces` | `GET /api/v1/account` per configured key |

### Campaigns
| Tool | Endpoint |
|---|---|
| `list_campaigns` | `GET /api/v1/campaigns/all` |
| `get_campaign_status` | `GET /api/v1/campaigns/status` |
| `get_campaign_name` | `GET /api/v1/campaigns/name` |
| `get_campaign_accounts` | `GET /api/v1/campaigns/accounts` |
| `create_campaign` | `POST /api/v1/campaigns/create` |
| `duplicate_campaign` | `POST /api/v1/campaigns/duplicate` |
| `rename_campaign` | `PUT /api/v1/campaigns/set-name` |
| `set_campaign_sequences` | `POST /api/v1/campaigns/add-sequence` |
| `set_campaign_schedule` | `PUT /api/v1/campaigns/set-schedule` |
| `update_campaign_options` | `POST /api/v1/campaigns/update-details` |
| `set_campaign_accounts` | `PUT /api/v1/campaigns/set-accounts` |
| `add_emails_to_campaign` | `POST /api/v1/campaigns/add-email` |
| `remove_email_from_campaign` | `POST /api/v1/campaigns/remove-email` |
| `start_campaign` | `POST /api/v1/campaigns/start` |
| `pause_campaign` | `POST /api/v1/campaigns/pause` |

### Analytics
| Tool | Endpoint |
|---|---|
| `get_campaign_analytics` | `POST /api/v1/analytics` |
| `get_analytics_summary` | `POST /api/v1/analytics/summary` |
| `get_warmup_analytics` | `GET /api/v1/analytics/warmup-analytics` |

### Campaign leads
| Tool | Endpoint |
|---|---|
| `list_campaign_leads` | `GET /api/v1/leads` |
| `get_lead_details` | `GET /api/v1/leads/details` |
| `add_leads_to_campaign` | `POST /api/v1/leads/add` |
| `update_campaign_lead` | `POST /api/v1/leads` |
| `change_leads_state` | `POST /api/v1/leads/change-state` |
| `delete_campaign_leads` | `POST /api/v1/leads/delete` |

### Lead lists
| Tool | Endpoint |
|---|---|
| `create_lead_list` | `POST /api/v1/lead-list/create` |
| `list_lead_lists` | `GET /api/v1/lead-list/all` |
| `get_lead_list` | `GET /api/v1/lead-list/details` |
| `rename_lead_list` | `PUT /api/v1/lead-list/update` |
| `delete_lead_list` | `DELETE /api/v1/lead-list/delete` |
| `add_leads_to_lead_list` | `POST /api/v1/lead-list/add-leads` |
| `get_lead_list_leads` | `GET /api/v1/lead-list/get-leads` |
| `update_lead_list_lead` | `PUT /api/v1/lead-list/update-lead` |
| `delete_lead_list_leads` | `DELETE /api/v1/lead-list/delete-leads` |
| `copy_leads_to_campaign` | `POST /api/v1/lead-list/copy-leads-to-campaign` |

### Blocklist
| Tool | Endpoint |
|---|---|
| `add_to_blocklist` | `POST /api/v1/blocklist/add` |
| `get_blocklist` | `GET /api/v1/blocklist/:table` |
| `delete_from_blocklist` | `DELETE /api/v1/blocklist/:table` |

### Email accounts
| Tool | Endpoint |
|---|---|
| `get_user_info` | `GET /api/v1/account` (docs say `/account`, which 404s) |
| `list_email_accounts` | `GET /api/v1/account/all` |
| `get_email_account_info` | `GET /api/v1/account/get-info` |
| `get_account_mailboxes` | `GET /api/v1/account/get-mailboxes/{email}` |
| `check_dns` | `POST /api/v1/account/dns` |
| `check_custom_domain_status` | `GET /api/v1/account/check-custom-domain-status` |
| `enable_warmup` | `POST /api/v1/account/warmup/enable` |
| `pause_warmup` | `POST /api/v1/account/warmup/pause` |
| `update_email_account_options` | `POST /api/v1/account/update-account` |
| `get_oauth_connect_url` | `POST /api/v1/account/get-oauth-url` |
| `connect_imap_account` | `POST /api/v1/account/create` |
| `update_imap_connection` | `POST /api/v1/account/update-connection` |
| `delete_email_account` | `DELETE /api/v1/account/:id` |
| `delete_email_accounts` | `DELETE /api/v1/account` |

### Onebox (unified inbox)
| Tool | Endpoint |
|---|---|
| `list_onebox_threads` | `POST /api/v1/onebox/list` |
| `get_onebox_thread` | `POST /api/v1/onebox/thread` |
| `mark_onebox_all_read` | `POST /api/v1/onebox/mark-all-read` |
| `send_onebox_reply` | `POST /api/v1/onebox/send` |
| `get_mailbox_messages` | `GET /api/v1/onebox/get-messages/{email}` |

### Inbox placement tests
| Tool | Endpoint |
|---|---|
| `list_inbox_placement_tests` | `GET /api/v1/inbox-placement/all` |
| `get_inbox_placement_test` | `GET /api/v1/inbox-placement/details/{id}` |
| `get_inbox_placement_results` | `GET /api/v1/inbox-placement/{id}/results` |
| `create_inbox_placement_test` | `POST /api/v1/inbox-placement/create` |
| `update_inbox_placement_test` | `PUT /api/v1/inbox-placement/update/{id}` |
| `start_inbox_placement_test` | `POST /api/v1/inbox-placement/{id}/start` |
| `pause_automated_inbox_placement_test` | `POST /api/v1/inbox-placement/automated/{id}/pause` |
| `resume_automated_inbox_placement_test` | `POST /api/v1/inbox-placement/automated/{id}/resume` |
| `rename_inbox_placement_test` | `PUT /api/v1/inbox-placement/{id}/rename` |
| `duplicate_inbox_placement_test` | `POST /api/v1/inbox-placement/{id}/duplicate` |
| `delete_inbox_placement_test` | `DELETE /api/v1/inbox-placement/{id}` |

### Tags
| Tool | Endpoint |
|---|---|
| `list_tags` | `GET /api/v1/others/get-all-tags` |
| `create_tags` | `POST /api/v1/others/create-tag` |
| `add_tag_to_campaign` | `POST /api/v1/others/add-tag-campaign` |
| `remove_tag_from_campaign` | `POST /api/v1/others/remove-tag-campaign` |
| `add_tag_to_emails` | `POST /api/v1/others/add-tag-email` |
| `remove_tag_from_emails` | `POST /api/v1/others/remove-tag-email` |

## Behaviour notes

- **Annotations.** Every tool carries MCP `readOnlyHint` / `destructiveHint` / `idempotentHint`
  annotations so clients can gate confirmations. All `delete_*` tools are marked destructive.
- **Rate limiting.** Calls are queued client-side to stay under 5 requests/second. HTTP 429 and
  5xx responses are retried with backoff (up to 2 retries, honouring `Retry-After`).
- **Errors.** API failures are returned as MCP error results containing the HTTP status and the
  response body, never thrown across the transport.
- **Real side effects.** `start_campaign`, `send_onebox_reply` and `start_inbox_placement_test`
  send real email. `connect_imap_account` accepts mailbox passwords; prefer the OAuth flow
  (`get_oauth_connect_url`) or the dashboard where possible.
- **Async lead ingestion.** `add_leads_to_lead_list` returns before leads are written. Sending a second
  batch while the first is still ingesting silently drops it. Send at most 100 leads per call and
  confirm `totalCount` from `get_lead_list_leads` has grown before the next batch.
- **Blocklist tables.** The docs only show `keyword` as a `:table` value. Other table names
  are not documented; try the category names used by `add_to_blocklist` if you need them.

## Development

```bash
npm run dev          # tsc --watch
npm run typecheck
npm run inspect      # opens the MCP Inspector against dist/index.js
```

Source layout:

```
src/
  index.ts          server bootstrap (stdio transport), list_workspaces tool
  workspaces.ts     per-workspace API keys, `workspace` argument injection, async-context routing
  client.ts         ReachInbox HTTP client: auth, rate limit, retries, errors
  helpers.ts        result wrappers, annotation presets, shared zod fragments
  tools/*.ts        one file per API resource group
```

## Things the ReachInbox API won't tell you

Learned while running real campaigns through this server:

- **Sequence `delay` is the wait *after* a step, not before it.** For emails on days 0/3/7, send delays `3, 4, 0`. Putting the delay on the following step sends step 2 minutes after step 1.
- **`lead-list/add-leads` is asynchronous and drops batches sent too quickly.** Send at most 100 leads per call and confirm the list's `totalCount` grew before sending the next batch.
- **You don't need to "resume" leads after starting a campaign.** New leads show `isPaused: true` by default; that flag is meaningless. Add leads, then `start_campaign`.
- **Use `America/Detroit` for US Eastern.** The API accepts `America/New_York` and schedules correctly, but the dashboard can't display it and shows Kolkata instead, so anyone pressing Save in the UI silently switches the campaign's timezone.
- **New campaigns can take hours before the first send**, and "Smart Time Gaps" spreads the daily quota across the window. Wait a full sending window before diagnosing "not sending".
- **Bounce protection judges the campaign's lifetime bounce rate.** If an early batch bounced heavily, restarting will trip it again; start a fresh campaign for the remaining leads instead.
- **Some receiving gateways reject young sending domains outright** (we saw ~90% bounces from Mimecast-protected companies). Check recipients' MX records before loading bank or insurance lists.
- **`duplicate_campaign` may not copy bounce protection.** Re-check campaign options after duplicating.
- **There is no endpoint to read back a campaign's sequences, schedule or options**, and no endpoint to delete a campaign. Keep your own copy of what you push.
- **The default Python `urllib` User-Agent is blocked by Cloudflare** (error 1010). Send a custom User-Agent if you call the API outside this server.

## License

Public domain ([The Unlicense](https://unlicense.org/)). No copyright; use it for anything.
