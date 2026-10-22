# Architecture

## 1. System overview

```
  Owner / Admin ───▶ React app (Vercel static)
  (browser)              │  fetch /api/*  (HttpOnly session cookie; no keys in the browser)
                         ▼
                 /api — one Vercel Node function (api/index.ts → server/router.ts)
                   routes · login · job queue (waitUntil) · daily cron
                   │         │          │         │          │          │
                Airtable   Claude    SerpAPI   Dropbox   Bannerbear   Resend
               (all data)                        ▲          │
             Editor uploads videos ──────────────┘          │
                                                            ▼
                            n8n / Make  ──▶  Metricool  ──▶  social platforms
                                 └── callback ──▶ /api/webhooks/publish
```

The client manages all data in **Airtable**. The app's tables live in the client's base next to their own tables, which the app never reads or changes. `scripts/airtable/schema.mjs` defines the tables; `npm run airtable:apply` creates missing tables and fields (additive only) and records the IDs it created in `manifest.json`.

## 2. Principles
- **Airtable is the state.** Status select fields plus the `Activity Log` table describe everything that has happened. Field and option names are the contract: never rename them, add new ones.
- **Routes are thin.** They check the caller, validate input, write a record and enqueue jobs; Claude, Dropbox and other slow work runs inside jobs.
- **External systems are reached only through `server/*` clients** (`claude.ts`, `dropbox.ts`, `serp.ts`, …), which carry retries, logging, mock mode and usage tracking. `server/airtable.ts` is the only module that calls Airtable (rate-limited to 5 requests/second per instance; 429s wait 30 s and retry).

## 3. Job system
- **Queue table:** Airtable `Jobs` (Type, Payload, Status, Attempts, Max Attempts, Run After, Locked At, Lock ID, Dedupe Key, Last Error, Result, Project).
- **Enqueue:** `enqueue(type, payload, {dedupeKey})` refuses a second pending job with the same dedupe key, writes a `queued` record, and starts it in the background of the same request with Vercel `waitUntil` (up to the function's 300 s limit).
- **Claim:** Airtable has no row locks, so a worker writes a random Lock ID and reads it back; a lost race skips the job. Handlers stay idempotent.
- **Outcome:** `succeeded`, or requeued with exponential backoff (`Run After = now + 2^attempts minutes`) until Max Attempts, then `failed`. An unknown type or a `PermanentJobError` fails at once.
- **Sweep:** `sweep()` runs due queued jobs (retries, missed starts) and releases stale locks (a job `running` for 10 minutes is requeued or failed). It runs on the daily cron and, at most once a minute per instance, whenever the app lists topics, projects or jobs. Admins can also retry a failed job from Jobs admin.
- **Final failure:** an `Activity Log` entry (`job_failed`) and an in-app notification to every admin.
- **UI updates:** TanStack Query polls (every 3 s while something is scoring or running, 30 s otherwise). There is no push channel.

**Job types:**

| Type | Payload | Does |
|---|---|---|
| `score_topic` | `{topic_id}` | Runs `topic_score`, writes `Topic Scores`, sets status; below the threshold, enqueues `regenerate_topic` (max 2 attempts, then the topic shows `error`) |
| `regenerate_topic` | `{topic_id, score_id}` | Runs `topic_regenerate` with the score's improvements, inserts the rewritten topic (`Regenerated From`) with its score. Once per topic |
| `generate_topics` | `{count}` | Runs `topic_generate`, inserts topics |
| `pull_trends` | `{keywords?}` | SerpAPI → `trend_to_topic` → inserts topics |
| `setup_project` | `{project_id}` | Dropbox folder tree + shared link, then enqueues `generate_script` (also if Dropbox fails, so the script isn't held back) and exports scripts not yet in Dropbox |
| `generate_script` | `{project_id, notes?}` | Runs `script_generate`, saves a new `Script Versions` record, enqueues `export_script` when the folder exists |
| `export_script` | `{version_id}` | Writes `01_Script/script_vN.docx` and `.md` to the project folder |
| `on_script_approved` | `{version_id}` | Writes `Script/script_APPROVED.docx` + `.md`, enqueues `generate_blog` (TODO: editor handoff, SLA, newsletter) |
| `generate_blog` | `{project_id, notes?}` | Runs `blog_generate` from the approved script, saves a new `Blog Versions` record (draft); earlier versions superseded |
| `on_blog_approved` | `{version_id}` | Writes `Blog_Script/blog_APPROVED.docx` + `.md`, then enqueues `generate_captions`, `generate_youtube`, `generate_ctas` and `generate_polls` |
| `generate_youtube` | `{project_id, notes?, video?}` | Runs `youtube_metadata_generate` for the long video and Short 1–3 (or one video): a YouTube `Caption Sets` record with 4 `Content Items` |
| `scan_uploads` | `{}` | Lists each project's `Long Youtube Final Video` and `Short Final Video` folders, records current videos as `Assets` (file ID + rev) |
| `dispatch_post` | `{post_id}` | Re-reads the post's approved caption and video, POSTs to the Make.com webhook, marks the post `sent` (cron `/api/cron/minute`, every minute, Vercel Pro) |
| `generate_ctas` / `generate_polls` | `{project_id, notes?}` | Run `cta_generate` / `poll_generate`: a `Caption Sets` record (Kind `cta` / `poll`) with 7 / 5 `Content Items` |
| `generate_captions` | `{project_id, notes?, channel?}` | Runs `captions_generate`: a new `Caption Sets` record with 28 `Content Items` (all), or replaces one channel's posts in the current set |
| `generate_blog` / `generate_newsletter` | `{project_id, notes?}` | New version, writes it to Dropbox |
| `dropbox_sync` | `{}` | Reads the change list from the cursor, upserts assets, checks settle time and readiness |
| `generate_content_pack` | `{project_id, asset_role?}` | Content items per template slot (captions + YouTube metadata) |
| `generate_graphics` | `{project_id, template_ids?}` | Graphics copy, then Bannerbear renders |
| `store_graphic` | `{graphic_id}` | Downloads the render and uploads it to Dropbox |
| `schedule_project` | `{project_id, day1_date}` | Creates or rebuilds scheduled posts |
| `dispatch_post` | `{scheduled_post_id, action}` | Re-checks the approval gate, then sends schedule, update or cancel to n8n |
| `send_email` | `{template, to, data, project_id}` | Sends through Resend and logs to `Emails` |
| `noop` | `{any}` | Smoke test: succeeds and echoes its payload. Enqueued by "Run test job" in Jobs admin |

## 4. API routes (`server/router.ts`)

| Route | Who |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | anyone (login checks the `Users` table) |
| `GET/POST /api/topics`, `PATCH /api/topics/:id`, `POST /api/topics/:id/{status,select,rescore}`, `GET /api/topics/:id/scores`, `POST /api/topics/{generate,trends}` | staff (owner, admin) |
| `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects/:id/{setup,script,blog}`, `POST /api/scripts/:id/{export,approve}`, `POST /api/blogs/:id/{approve,reject}`, `POST /api/projects/:id/{captions,youtube,ctas,polls}`, `PATCH /api/content-items/:id/poll`, `POST /api/content-items/:id/{approve,reject}`, `POST /api/caption-sets/:id/approve-all` | staff |
| `GET/PATCH /api/settings…`, `/api/seed-keywords…` | staff; changing settings is admin only |
| `/api/prompts…` (list, new version, activate, sample, test-run), `/api/jobs…` (list, test, retry) | admin |
| `GET /api/cron/daily` | Vercel Cron (`Authorization: Bearer CRON_SECRET`) |
| Later phases: `/api/approve/:token`, `/api/webhooks/{dropbox,bannerbear,publish,resend}` | token / signature / shared secret |

**Login.** Users are created with `npm run user:create` (invite-only). The password is stored as a scrypt hash in `Users.Password Hash`; a successful login sets a 14-day HttpOnly, SameSite=Lax cookie signed with `SESSION_SECRET`. Every request re-reads the user's role from Airtable, so changing a role or clearing the hash takes effect at once.

**Cron.** Vercel Cron calls `/api/cron/daily` once a day (12:00 UTC). It checks the local *date* in `settings.timezone`: the first Monday of the month queues `generate_topics`, every Monday queues `pull_trends`. Each run has an idempotency key stored on its job, so a repeated call does nothing twice. Then it sweeps the queue.

## 5. `server/` modules

| Module | Holds |
|---|---|
| `airtable.ts` | list / get / create / update / destroy with rate limiting, formula helpers, field readers |
| `mappers.ts` | Airtable record → `src/types/api.ts` shapes |
| `auth.ts` | password hashing, session cookies, `requireUser`, `requireCron` |
| `claude.ts` | `runPrompt(key, variables, schema)`: loads the active prompt, renders `{{vars}}`, appends the output contract, calls the Messages API, validates with zod, retries once, logs usage |
| `serp.ts` | Google Trends, YouTube and related-questions search |
| `dropbox.ts` | token refresh, create folders, upload, shared link (later: list folder / continue, temporary link, download) |
| `paths.ts` | pure Dropbox path rules (project folder, subfolders, file names) |
| `script-doc.ts` | a script version as Markdown and as a Word document |
| `settings.ts` | typed settings with documented defaults |
| `log.ts` | `activity()`, `usage()`, `notifyAdmins()` |
| `jobs/` | `queue.ts` (enqueue, claim, run, sweep), `rules.ts` (pure backoff), handlers per domain |
| `fixtures/` | responses used when `MOCK_EXTERNAL=true` |
| later: `bannerbear.ts`, `email.ts`, `n8n.ts`, `sla.ts`, `tokens.ts` | as described in docs/integrations.md |

## 6. Key flows

### 6.1 Topic scoring
`POST /api/topics` → `insertTopics()` numbers the topic, flags a likely duplicate (`Duplicate Of`: trigram similarity > 0.6 against the last 12 months), logs `topic_created` and enqueues `score_topic` → the job sets status `scoring` → `runPrompt('topic_score')` → a `Topic Scores` record → the topic gets `Score Total`, `Latest Score` and `qualified` / `needs_work` → `Activity Log` → the Inbox picks it up on its next poll.

Below the threshold → `regenerate_topic` job → `runPrompt('topic_regenerate', {prior_improvements})` → a new topic (status `scoring`, so no second score job; `Regenerated From` = original) → its `Topic Scores` record from the same response → `qualified` / `needs_work`.

### 6.2 Selecting a topic → folder → script
1. **Select** (`POST /api/topics/:id/select`): one project per topic. Creates the `Projects` record (cycle month, next sequence in that month, slug, default schedule template), sets the topic to `selected`, and enqueues `setup_project`.
2. `setup_project` creates `{root}/{YYYY}/{MM}-{Month}/{NN}-{Title-Slug}/` with the 8 subfolders (existing folders are reused), stores the path, folder ID and shared link, then enqueues `generate_script`.
3. `generate_script` runs `script_generate`, saves `Script Versions` v1 (status `draft`; the project becomes `script_draft`), then `export_script` uploads `01_Script/script_v1.docx` and `script_v1.md`.
4. If Dropbox fails or isn't connected, the script is still generated and saved in Airtable; **Retry Dropbox setup** on the project page creates the folder and uploads any script not yet there.

### 6.3 Script approval by email (Phase 2, next)
1. `generate_script` → version `awaiting_approval`.
2. `send_email('script_approval')` with 2 tokens (approve and changes).
3. The owner clicks → `/approve/:token` page → POST `/api/approve/:token {decision, notes?}` → verify the hash, expiry and unused state → record `Approvals` → mark the token used.
   - **approve:** enqueue `on_script_approved`.
   - **changes:** version `changes_requested`, then enqueue `generate_script {notes}`.

### 6.4 Video detection
1. Dropbox POSTs to `/api/webhooks/dropbox` → verify → a single pending `dropbox_sync` job.
2. The job runs `list_folder/continue` → for each file under a project's `04`/`05` folder, upsert `Assets` (new `rev` → the previous one is no longer current).
3. Settle checks run with the sweep (assets settled after N minutes without change).
4. When all 4 roles are current and settled → project `videos_ready` → enqueue `generate_content_pack` and (if configured) `generate_graphics`.

### 6.5 Publishing
1. The owner approves a content item → item `approved` → its scheduled post becomes `queued` → enqueue `dispatch_post {action: schedule}`.
2. `dispatch_post` re-reads the content item and refuses anything not `approved` (the server half of the approval gate), then POSTs to the n8n webhook → `sent` → n8n schedules in Metricool.
3. n8n calls `/api/webhooks/publish {status: scheduled, metricool_post_id}` → `scheduled`.
4. Later, n8n calls back with `{status: published, published_url}` → `published`. When the published post is the long video on YouTube, the job that resolves the blog's `{{youtube_embed}}` is enqueued.

## 7. Error handling
- **External calls:** 3 attempts with backoff inside the client. On final failure, the job fails with a readable `Last Error`, and admins get an in-app notification.
- **Readable errors:** errors surfaced in the UI name the step and the next action, e.g. "Dropbox upload failed for script_v2.docx — Retry upload".
- **No silent drops:** unknown webhook payloads are stored in `Activity Log` (event `webhook_unhandled`) and answered with 200. Signature failures get 401.

## 8. Environments
- **local:** `npm run dev` (Vite serves the app and `/api`), `.env.local`. `MOCK_EXTERNAL=true` uses fixtures for Claude, SerpAPI and Dropbox; Airtable is always real, so point local work at a copy of the base when experimenting.
- **staging:** a Vercel preview deployment with its own Airtable base, a real Dropbox test folder (`settings.dropbox.root = /TrueU-Staging`), and n8n pointed at a Metricool test brand or a dry-run branch.
- **production:** Vercel production, the client's base. Set every `.env.example` value as a Vercel environment variable.
