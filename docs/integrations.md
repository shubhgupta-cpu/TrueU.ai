# Integrations

All calls go through `supabase/functions/_shared/*`. Secret names match `.env.example`. Before implementing a client, check the provider's current API docs; endpoint details below are a guide, not a guarantee.

## 1. Anthropic Claude
- **Used for:** topic generation, trend → topic, scoring, script and regeneration, blog, newsletter, captions, YouTube metadata, graphics copy, quick rewrites.
- **API:** Messages API through the official SDK (`npm:@anthropic-ai/sdk`, pinned in `_shared/deps.ts`). Secret `ANTHROPIC_API_KEY`.
- **Model:** per prompt (`prompts.model`), falling back to `settings.models.default`. Use the `fast` model for quick rewrites and trend → topic.
- **Contract:** `runPrompt(key, vars, zodSchema)`. See `docs/prompts.md` for how prompts are rendered and what each must return.
- **Logging:** tokens, cost and duration go to `usage_log` (provider `anthropic`).
- **Limits:** set `max_tokens` per prompt; the blog needs a large budget. Timeout 120 s. Retry on 429 and 5xx.

## 2. SerpAPI
- **Used for:** the weekly trending topics.
- **Secret:** `SERPAPI_API_KEY`.
- **Engines per active seed keyword:**
  - `google_trends`: rising related queries
  - `youtube`: top results for the keyword
  - `google`: "related questions" (People also ask)
- **Flow:**
  1. Collect the raw items.
  2. De-duplicate them.
  3. Send them to `trend_to_topic` in one call per keyword; it returns 0–3 topics each.
  4. Insert the topics.
- **`source_detail`:** `{keyword, angle, trend_reason, items: [{engine, query, value?, url?}] (top 5 after de-duplication), fetched_at}`. A topic usually comes from several items, so the items are kept as a list.
- **Failures:** one engine failing doesn't lose the others; one keyword failing doesn't lose the other keywords. The job fails only when every keyword fails.
- **Cap:** at most `settings.max_trend_topics_per_run` (default 10) topics per run.

## 3. Dropbox
- **App:** scoped access, "Full Dropbox" or "App folder" (OQ-2).
- **Permissions:**
  - `files.metadata.read` / `write`
  - `files.content.read` / `write`
  - `sharing.write` / `sharing.read`
- **Auth:** offline access, stored as `DROPBOX_REFRESH_TOKEN`; exchange it for short-lived access tokens (cache until expiry). Secrets: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`.

**Endpoints used:**

| Purpose | Endpoint |
|---|---|
| Create folders | `POST /2/files/create_folder_batch` (or `create_folder_v2`; ignore "already exists") |
| List changes | `POST /2/files/list_folder` (`recursive: true`) → `POST /2/files/list_folder/continue` with the stored cursor |
| Upload text/docs/images | `POST content /2/files/upload` (mode `overwrite` for APPROVED files, `add` for versions) |
| Preview link | `POST /2/files/get_temporary_link` (about 4 h) |
| Shared link | `POST /2/sharing/create_shared_link_with_settings`; on "already exists", use `list_shared_links` |
| Download | `POST content /2/files/download` (for Dropbox-import of edited .md) |

**Webhook** (`dropbox-webhook`):
- **GET:** respond with the `challenge` query parameter as plain text.
- **POST:** verify `X-Dropbox-Signature` = HMAC-SHA256(body, `DROPBOX_APP_SECRET`). The body only says *something changed*: enqueue `dropbox_sync` and return 200 quickly.

**Path rules:**
- **Root:** `settings.dropbox.root` (default `/TrueU`).
- **Project folder:** `{root}/{YYYY}/{MM}-{MonthName}/{NN}-{Title-Slug}`, e.g. `/TrueU/2026/10-October/01-Why-Entrepreneurs-Struggle`.
- **Mapping:** a changed file maps to a project by longest-prefix match against `projects.dropbox_folder_path` (case-insensitive; Dropbox returns `path_lower`). Store `projects.dropbox_folder_id` too, for rename safety.

## 4. Bannerbear
- **Secrets:** `BANNERBEAR_API_KEY`, `BANNERBEAR_WEBHOOK_SECRET`.
- **Templates:** `GET /v2/templates` (and a single template) → sync to `graphic_templates` and `template_layers` (layer names come from the template's available modifications).
- **Render:** `POST /v2/images` with:
  - `{ template, modifications: [{name, text} | {name, image_url}], webhook_url, metadata }`
  - `webhook_url = {SUPABASE_URL}/functions/v1/bannerbear-webhook?secret={BANNERBEAR_WEBHOOK_SECRET}`
  - `metadata = graphic_id`
- **Webhook:** verify the secret (and the authorization header Bannerbear sends, if configured), look up the graphic by `bannerbear_uid` or metadata, set `ready`, and enqueue `store_graphic`.
- **Images:** image layers get a stable URL — a brand library image in Supabase Storage, or a frame URL.
- **Usage:** one `usage_log` row per render (provider `bannerbear`, units 1).

## 5. Email — Resend (recommended)
- **Secrets:** `RESEND_API_KEY`, `EMAIL_FROM`; verify the client's sending domain first (SPF/DKIM DNS records).
- **Templates** in `_shared/emails/`: `script_approval`, `editor_handoff`, `sla_reminder`, `sla_escalation`, `content_ready_for_review`, `publish_failed`, `weekly_digest`.
- **Tracking:** events (delivered, opened, clicked, bounced) arrive at `resend-webhook` and update `emails`.
- **Approval buttons** link to `{APP_URL}/approve/{token}?d=approve` or `?d=changes`. The page needs one explicit confirm click, so link scanners can't approve anything.

## 6. n8n / Make → Metricool (publishing)

> **Built 2026-10-22 to the client's list.** The app (cron `/api/cron/minute`, `dispatch_post`) POSTs to the platform's own Make webhook **at the scheduled time**, so each scenario must publish immediately. One URL per platform (`MAKE_WEBHOOK_*` env). Bodies: Facebook, Instagram, YouTube Shorts, YouTube Long: `video_title, video_url, post_content, hashtags`; TikTok: `video_url, post_content, hashtags`; Threads, X, Pinterest: `post_content, hashtags, url`; plus `scheduled_post_id` and `platform` on all. Optional callback from Make: `POST /api/webhooks/publish-callback` (header `X-Cockpit-Secret`) with `scheduled_post_id`, `status` (`scheduled`/`published`/`failed`), `metricool_post_id`, `published_url`, `error`. Without a callback a post stays `sent`.

- **Secrets:** the eight `MAKE_WEBHOOK_*` URLs (one per platform) and `MAKE_WEBHOOK_SECRET`. The older generic `schedule` / `update` / `cancel` contract below is superseded by the per-platform bodies above; update and cancel are not built.

**App → n8n** (POST JSON, header `X-Cockpit-Secret: <MAKE_WEBHOOK_SECRET>`):
```json
{
  "action": "schedule",
  "scheduled_post_id": "uuid",
  "content_item_id": "uuid",
  "project_id": "uuid",
  "project_title": "Why entrepreneurs struggle to trust their own decisions",
  "platform": "instagram_reels",
  "media_type": "video",
  "media_url": "https://…stable direct-download URL…",
  "thumbnail_url": null,
  "title": null,
  "caption": "Full caption text…",
  "hashtags": ["#decisionmaking", "#founders"],
  "first_comment": null,
  "link": null,
  "scheduled_at": "2026-10-07T16:30:00Z",
  "scheduled_at_local": "2026-10-07T22:00:00",
  "timezone": "Asia/Kolkata",
  "use_best_time": true,
  "metricool_post_id": null,
  "callback_url": "https://<project>.supabase.co/functions/v1/publish-callback"
}
```
- `action` is `schedule`, `update` or `cancel`. For update and cancel, `metricool_post_id` is set.
- **YouTube (long video):** `title` and `extra.youtube` go in `description`, `tags` and `chapters`, whether or not the n8n flow uploads through Metricool.
- **Blog and newsletter:** `media_type: "text"`, with the body in `caption` (markdown) or a `content_url` (OQ-5).

**n8n → app** (`publish-callback`, header `X-Cockpit-Secret`):
```json
{
  "scheduled_post_id": "uuid",
  "status": "scheduled",
  "metricool_post_id": "12345",
  "published_url": null,
  "error": null,
  "occurred_at": "2026-10-05T10:02:11Z"
}
```
- `status` is `scheduled`, `published` or `failed`.
- **Idempotency:** ignore callbacks that would move a post backwards (e.g. `scheduled` after `published`), and log them.
- **Getting `published` events:** they need either a Metricool webhook forwarded by n8n, or an n8n poll of Metricool's post status. Confirm which the existing workflow supports (OQ-4).

## 7. WordPress and ActiveCampaign
- **v1 default:** sent through n8n like any other post (OQ-5).
- **If the app publishes directly instead:**
  - **WordPress:** REST API with an application password (`WP_URL`, `WP_USER`, `WP_APP_PASSWORD`), creating the post as `future` with a date.
  - **ActiveCampaign:** campaign API with `AC_API_URL` and `AC_API_KEY`.
