# TrueU Content Cockpit — CLAUDE.md

Guidance for Claude Code working in this repository. Read this file fully before any task.

## What we are building

An internal web app for TrueU.ai's content operation. It replaces a spread of Airtable views, Make.com and n8n scenarios with one UI where the owner (our client) can:

1. Collect video topics from three sources: the owner's own submissions, Claude-generated topics, and trending topics from SerpAPI.
2. Score every topic automatically against the client's scoring prompt (6 criteria, 60 points, pass mark 45).
3. Select topics for the month (default 4).
4. Generate the 8-scene script, get it approved by the owner **by email or in the app**, then hand it to the video editor.
5. Detect the editor's uploads in Dropbox (1 long video + 3 shorts per topic).
6. Generate the content pack: YouTube metadata, per-platform captions and hashtags for each short, blog post, newsletter, and graphics from the client's Bannerbear templates.
7. Preview every post the way it will look on each platform, approve it, and schedule it.
8. Hand approved posts to the existing n8n/Make automations, which schedule them in Metricool.

**Nothing is ever published without an explicit approval.** This is the product's most important rule.

## Read these before coding

| Doc | What it holds |
|---|---|
| `docs/spec.md` | Features, acceptance criteria, statuses, screens. **The source of truth for behaviour.** |
| `docs/architecture.md` | System design, API routes, job queue and job types, cron, end-to-end flows |
| `docs/integrations.md` | Claude, SerpAPI, Dropbox, Bannerbear, email, n8n/Metricool contracts |
| `docs/publishing-schedule.md` | The 15-day posting schedule and the scheduling algorithm |
| `docs/prompts.md` | Prompt keys, variables, and the JSON each prompt must return |
| `docs/build-plan.md` | Phases, tasks and "done" criteria. Work phase by phase |
| `docs/open-questions.md` | Undecided items. **Do not guess answers; see the rule below** |
| `scripts/airtable/schema.mjs` | The data model (Airtable tables, fields, select options, links). Mirrors `docs/spec.md` |

## Stack

- **Data:** Airtable — the client manages all data there. One base; the app's 28 tables are created by `npm run airtable:apply` (their IDs are in `scripts/airtable/manifest.json`). The base's other tables (the client's own: Table 1, Instagram Posts, Facebook Posts, LinkedIn Posts, Youtube videos, Comment Replies) are never touched.
- **AI model:** Claude Haiku 5.5 for every prompt (`settings.models` = `{default, fast}: claude-haiku-5-5`, client's choice 2026-10-14). A prompt's own `Model` field overrides it.
- **Frontend:** React 18 + Vite + TypeScript (strict), Tailwind CSS, shadcn/ui (Radix) components, React Router, TanStack Query (polling, no push), react-hook-form + zod, date-fns + date-fns-tz.
- **Backend:** one Vercel Node function (`api/index.ts` → `server/router.ts`) holding every secret. Background work runs as jobs in the Airtable `Jobs` table, started with Vercel `waitUntil`; Vercel Cron runs once a day. In development the Vite dev server serves `/api` from the same router.
- **Login:** invite-only users in the Airtable `Users` table (scrypt password hash) and a signed HttpOnly session cookie. No external auth provider.
- **External services:** Anthropic Claude API, SerpAPI, Dropbox API, Bannerbear API, Resend (transactional email), n8n/Make webhooks → Metricool.
- **Tests:** Vitest for the frontend and the server's pure logic (`server/tests/`).
- **Hosting:** Vercel (frontend + `/api`).

## Repository layout

```
/
├─ CLAUDE.md
├─ .env.example
├─ docs/
├─ src/
│  ├─ app/              # router, providers, layout (sidebar)
│  ├─ pages/            # one folder per route (see docs/spec.md §7)
│  ├─ features/         # domain modules: topics, projects, scripts, blog,
│  │                    # newsletter, assets, content, graphics, schedule,
│  │                    # pipeline, prompts, settings
│  │   └─ <feature>/    # api.ts (queries/mutations), components/, hooks/, schema.ts
│  ├─ components/
│  │   ├─ ui/           # shadcn/ui primitives
│  │   └─ previews/     # platform preview mockups
│  ├─ lib/              # api.ts (fetch /api), status.ts, time.ts, utils.ts
│  └─ types/api.ts      # shapes the API returns (shared with server/)
├─ api/index.ts         # the Vercel function: hands every /api/* request to server/router.ts
├─ server/
│  ├─ router.ts         # every route + auth checks
│  ├─ airtable.ts       # the only module that talks to Airtable
│  ├─ mappers.ts        # Airtable record → src/types/api.ts shapes
│  ├─ auth.ts, claude.ts, dropbox.ts, serp.ts, settings.ts, log.ts, …
│  ├─ jobs/             # queue.ts, rules.ts, handlers.ts + one file per domain
│  ├─ repo/             # topic / project reads and writes
│  ├─ schemas/          # zod output contracts per prompt
│  ├─ fixtures/         # MOCK_EXTERNAL responses
│  └─ tests/
├─ scripts/
│  ├─ airtable/         # schema.mjs (source of truth), apply.mjs, seed.mjs, manifest.json
│  ├─ create-user.ts
│  └─ dropbox-connect.mjs
├─ vercel.json          # rewrites, function duration, daily cron
└─ tests/
```

## Commands

```bash
npm install
cp .env.example .env.local          # then fill in the keys (server-side only)
npm run airtable:apply              # create/extend the app's tables (additive, never edits others)
npm run airtable:seed               # default settings, prompts, schedule (empty tables only)
npm run user:create -- you@x.com admin "Your Name"   # invite-only logins
npm run dropbox:connect             # one-time Dropbox authorisation (see the script header)
npm run dev                         # app + /api on http://localhost:5173
npm run typecheck && npm run lint && npm run test
```

Run `typecheck`, `lint` and `test` before calling any task done.

## Current state (keep this section up to date)

Last updated 2026-10-22. Details live in `docs/spec.md` (F-numbers below), `docs/prompts.md` and `docs/architecture.md`.

### The pipeline as built

| # | Step | Starts when | Job | Output (Airtable) |
|---|---|---|---|---|
| 1 | Topic added | Owner submits (Inbox); **Generate with Claude** / 1st-Monday cron (Monthly Content Strategy Agent: 10 ranked topics, after one Google Trends call made by the app); **Pull trends** / Monday cron (seed keywords × SerpAPI) | `generate_topics`, `pull_trends` | `Topics` (strategy details in Source Detail) |
| 2 | Topic scored | On insert | `score_topic` (below 45: `regenerate_topic` once automatically; **Regenerate from suggestions** button any time, F3.7) | `Topic Scores` |
| 3 | Dropbox folder | Owner clicks **Select** | `setup_project` | `Projects` (folder path, ID, share link) |
| 4 | Script written | After step 3 (also if Dropbox fails) | `generate_script` → `export_script` | `Script Versions`; `Script/script_vN.docx` + `.md` (older versions' files deleted) |
| 5 | Script approved | Owner: **Approve** / **Request changes** (notes → new version) | `on_script_approved` | `Script/script_APPROVED.docx`; `Approvals` |
| 6 | Blog written | After step 5 | `generate_blog` | `Blog Versions` (draft; not in Dropbox) |
| 7 | Blog approved | Owner: **Approve** / **Reject** / **Regenerate** | `on_blog_approved` | `Blog_Script/blog_APPROVED.docx` + `.md` |
| 8 | Social captions | After step 7 | `generate_captions` | `Caption Sets` (Kind social) + 28 `Content Items` |
| 9 | YouTube metadata | After step 7 | `generate_youtube` (4 parallel runs) | `Caption Sets` (Kind youtube) + 4 `Content Items` |
| 10 | CTAs & hooks | After step 7 | `generate_ctas` | `Caption Sets` (Kind cta) + 7 `Content Items` |
| 11 | Polls | After step 7 | `generate_polls` | `Caption Sets` (Kind poll) + 5 `Content Items` |

- Every generated item can be approved / rejected (reason kept) and regenerated with notes; sets also have **Approve all pending**. Every decision → `Approvals`. Items breaking a prompt rule are `needs_edit` (still approvable after review).
- Where the owner works: **Topic Inbox** (full-width list; shows what the last Claude / trends run did) → click a topic → its own page **`/topics/:id`**: score details, actions (Select, Save, Reject, Rescore, Regenerate from suggestions, Edit, **Delete**) and, once selected, "Script, blog & captions" (pipeline steps 1–11, then each panel). The project page (`/projects/:id`) has the same panels plus **Progress** (`src/features/projects/steps.ts`) and the job log.
- **Delete** (`DELETE /api/topics/:id`, `deleteTopicCascade`): removes the topic, its scores and its project with all generated records (script/blog versions, caption sets, content items) from Airtable and cancels pending jobs. Dropbox files, Activity Log, Approvals and Usage Log are kept.
- **Short titles:** topics the app writes (rewrites, Claude and trend topics) are 5–6 words, never more than 8 (`ShortTitle` in `server/schemas/topics.ts`; a longer one fails validation and is retried). Owner-typed titles are kept as typed.
- Older projects (approved before a step existed) get a **Generate** button in that panel.

### Schedule and calendar (built 2026-10-22)

- Pure math in `src/lib/schedule.ts` (`buildSchedule`, Eastern time via date-fns-tz, DST gap handled; tests in `tests/schedule.test.ts`). `settings.timezone` is now `America/New_York` (client calendar image: "All times Eastern").
- `server/repo/schedule.ts`: `POST /api/projects/:id/schedule {day1}` replaces the project's unsent posts with 26 `Scheduled Posts` (status `planned`) from the default Schedule Template; `GET /api/schedule` and `GET /api/projects/:id/schedule` read them. Rebuild is refused (409) once a post is sent / scheduled / published.
- UI (`src/features/schedule/`): **posting-week picker** (`PostingWeek`: the next 12 Tuesdays, overlap warning when another project's cycle is within 14 days, builds / moves the schedule) on the project page sidebar, `/projects/:id/schedule` and the Calendar's **Plan the month** (one picker per topic, so each of the month's topics gets its week); `/calendar` also shows one grid per project. Project page has a **View schedule** button.
- The template matches the client's calendar image (22 Oct): Short 2 and Short 3 swapped on YouTube Shorts D7/D8, Instagram Feed D6/D12, TikTok D10/D11, Reels D14 is Short 3; newsletter on Day 8 at 10:00. Short 1 unchanged. Totals: Short 1 × 7, Short 2 × 8, Short 3 × 8, long × 1, blog, newsletter.
- **Posting week + spread:** pick the start week per topic (Tuesday) and a 2 / 3 / 4-week spread (3 and 4 push Day 8 onward later in whole weeks, weekdays hold). Click any time in the grid to change that post's date and time (`PATCH /api/scheduled-posts/:id`, marks it `Custom Time`; a rebuild resets hand-set times).
- **Videos:** `scan_uploads` (every 5 min from the cron, or **Check Dropbox now**) lists `Long Youtube Final Video` and `Short Final Video` in each project's folder → `Assets` (by Dropbox file ID + rev; Settled after `settings.dropbox.settle_minutes`). A short's number comes from its file name (`Short 2.mp4`); an unreadable name is role `other` and flagged on the project's **Videos** card.
- **Videos in another folder:** when the editor's folder isn't the one the app created (e.g. `Mid-Career Success Emptiness` vs the app's `Mid Carrier Success Emptiness`), set `Projects.Videos Folder Path` (Videos card → "Videos in a different folder?", `PATCH /api/projects/:id/videos-folder`); the scan reads that folder instead. File names like `…-1of3-FINAL.mp4` are read as Short 1/2/3. (A stray empty field `Script Versions.Videos Folder Path` was created by mistake on 2026-10-22; Airtable's API can't delete fields: ignore it.)
- **Publishing (needs Vercel Pro: per-minute cron):** `/api/cron/minute` → `queueDue`: a `planned` post whose time has passed, whose caption (Content Item matched by `server/publish-map.ts`: channel + post) is **approved** and whose video is settled → claimed (`queued`) → job `dispatch_post` re-reads approval, POSTs the platform's body to its Make webhook (header `X-Cockpit-Secret: MAKE_WEBHOOK_SECRET`) → `sent`. More than 60 min late → `failed` (never posted late). Make reports back at `POST /api/webhooks/publish-callback` (same secret): `scheduled` / `published` / `failed` + Metricool ID; never moves a post backwards. Blog and newsletter are not dispatched yet.
- **Section tabs:** `ProjectSections` (project page and `/topics/:id`) has a sticky tab bar (Script · Blog · Captions · YouTube · CTAs & hooks · Polls · Previews) that scrolls to each panel and highlights the one in view.
- **Previews:** the project page's **Previews** panel (tabs: Short 1/2/3, Long video) shows each caption inside a platform-shaped frame (vertical for Reels / TikTok / Shorts, feed for Instagram / Facebook / LinkedIn, text for X / Threads, pin, YouTube player), with the editor's Dropbox video (`GET /api/assets/:id/video` → 4-hour temporary link), the text folded where the platform folds it (`src/lib/preview.ts`) and an over-280 warning for X. `GET /api/projects/:id/previews`; one Content Item can feed several platforms (Reels + TikTok). An approximation, not the platforms' own renderer.
- **Webhooks (client's list, 2026-10-22), one Make URL per platform** in env `MAKE_WEBHOOK_FACEBOOK / _INSTAGRAM (Reels + Feed) / _TIKTOK / _YOUTUBE_SHORTS / _YOUTUBE_LONG / _THREADS / _TWITTER / _PINTEREST` (set in `.env.local` and in Vercel; never in the repo). Body per platform (`webhookBody` in `server/publish-map.ts`): Facebook, Instagram, YouTube Shorts and Long = `video_title, video_url, post_content, hashtags`; TikTok = `video_url, post_content, hashtags`; Threads, X, Pinterest = `post_content, hashtags, url`; every body also carries `scheduled_post_id` and `platform`. `video_title` = the YouTube metadata title of the same video (fallback: topic title); `video_url` = Dropbox direct link (`dl=1`). `url` for Threads / X / Pinterest is the video link, and YouTube Long takes the same fields as Shorts (both confirmed by the client).

### Prompts (Airtable `Prompts`, active versions)

| Key | Client prompt | Inputs filled by the app (code: `server/schemas/*.ts`) |
|---|---|---|
| `topic_score` v2 | Topic Validation v2.0 | `{{topic}}` (n8n placeholders were replaced) |
| `topic_regenerate` v3 | Topic Validation & Regeneration v2.1 (+ app `<title_rule>`: 5–8 words) | `{{topic}}`, `{{prior_improvements}}`, `{{current_date}}` |
| `topic_generate` v3 | Monthly Content Strategy Agent | month, current_date, trend_query + trend_data (the app's single SerpAPI Google Trends call, `settings.monthly_trend_query`; none → seasonal-only), saved_topics, recent_titles. Title = `topic_short`, description = `episode_title`; SAVED entries are skipped |
| `trend_to_topic` v2 | App default (ours) | keyword, trend_items, current_date |
| `script_generate` v2 | Storyboard Creation Prompt v2.0 | topic, episode_title + shared_value (from the score's storyboard), notes |
| `blog_generate` v2 | Blog Post Generator v1.0 | topic_title, decision_domain, script_summary, keywords + search_intent (score), notes |
| `captions_generate` v2 | Social Media Content Generator v2.4 | content_title, topic, key_message, content_url, weekly_hashtags, notes, focus (one channel) |
| `youtube_metadata_generate` v2 | YouTube SEO Metadata Generator v2.0 | per video: duration, summary ≤500, timestamps, keywords, video_id, language EN |
| `cta_generate` v1 | CTA and Hook Generation Agent v3.7 | video_title, category, key_points, lead_magnet, blog_url |
| `poll_generate` v1 | Poll Question Generator v1.0 | its own `{{video_title}}`, `{{topic}}`, `{{script_summary}}`, `{{key_themes}}` |

- The client's text is stored as sent; the app only appended an input block with `{{variables}}` (see each record's Notes). Still placeholders: `script_regenerate`, `newsletter_generate`, `graphics_copy_generate`, `quick_rewrite` (jobs using them fail with "Prompt … not configured").
- Haiku quirks handled in code: a stray/misplaced `}` (`extractJson` takes the first complete JSON value; `regroupEvaluation` re-nests the score); long outputs need Max Tokens 16000–32000 (set per prompt record).

### Dropbox

- Connected to the **team space** of `trueu.ai.saas@proton.me` (calls carry `Dropbox-API-Path-Root`, `server/dropbox.ts`). App key in `.env.local`; refresh token via `npm run dropbox:connect`.
- Layout (`settings.dropbox`): `/Year - {YYYY}/{Month} {YYYY}/{Topic name}/` + 15 subfolders (B_Roll … Thumbnail). Script → `Script/`, blog → `Blog_Script/`. Year and month folders are created when missing.

### Settings keys added (Airtable `Settings`)

`models`, `dropbox` (layout), `weekly_hashtags`, `social_content_url`, `blog_url`, `lead_magnet`, `monthly_trend_query` — plus the original keys in `docs/spec.md` §8.

### Not built yet / waiting on the client

- **Editor handoff** after script approval (email? Dropbox only?) — `TODO` in `onScriptApproved`.
- Email approval links (Resend), SLA reminders, Bannerbear graphics, blog / newsletter dispatch (no Make webhook for them yet), editing a post after it is sent, clash warnings, newsletter. The schedule, calendar, upload detection and dispatch are built (see above); **needs Vercel Pro, the eight `MAKE_WEBHOOK_*` URLs, `MAKE_WEBHOOK_SECRET` and `CRON_SECRET` set in Vercel before it can send**.
- To confirm: the blog's public URL (`blog_url`, `social_content_url`), lead magnet, weekly hashtags, ES/PT-BR YouTube metadata, whether YouTube needs polls.
- **SerpAPI key** (`SERPAPI_API_KEY`) is not set: **Pull trends** fails with that reason, and Generate with Claude runs on seasonal context only (`trend_data_used: false`). Pull trends also needs seed keywords (Settings).

### Admin: Users and Usage (2026-10-22)

- Sidebar (admin only): **Prompts · Users · Usage** (the Jobs page was removed; a topic's job log is on its project page).
- **Users** (`/admin/users`, `server/repo/admin.ts`): head count of people with access by role, each person's role (editable), status (Active / Locked / Access removed), last sign-in (`Users.Last Sign In`), **Reset password** (new random password shown once; also restores removed access and clears a lockout), **Remove access** (clears the password hash; the record stays) and **Add a person** (random password shown once). You can't remove or demote yourself or the last active admin (`accessChangeError`, tested). Routes `/api/admin/users…`, admin only.
- **Usage** (`/admin/usage`, `server/usage.ts`): last 90 days from the Usage Log: totals, by month, prompt, topic and service, and the 20 latest calls. Costs are estimates from token counts (prompt-cache reads/writes priced separately).

### Speed, caching and safety measures (2026-10-22)

- **Why pages were slow:** Airtable answers in about 0.3 s per call and allows 5 calls/s, so a page that needs ~10 calls takes 2–3 s. The levers are fewer calls and not waiting for them. Measured: project page 4.9 s → ~2.4 s; settings read 310 ms → 0 ms when cached.
- **Server cache** (`server/cache.ts`, per instance, shared in-flight loads): signed-in user 30 s (a removed user or changed role takes up to 30 s to apply), settings 10 s, active prompts 20 s (dropped on save / activate). Never cached: Jobs, Content Items, anything the queue or approvals read. `projectDetail` loads the four caption sets' posts in one query.
- **Instant buttons:** approve, reject and approve-all flip the post on screen at once (`useOptimisticAction`) and roll back if the server refuses; the audit rows (Approvals, Activity Log) are written right after the response (`background()`). The browser keeps each page's data for 30 s.
- **Prompt caching:** `cacheableBlocks` (`server/claude.ts`) marks the client's prompt text before the first `{{variable}}` as cacheable, so repeat runs read it from Anthropic's cache (cache reads cost 10%, writes 125%; the Usage Log cost accounts for both). Keep the variables at the END of a prompt, otherwise nothing is cacheable.
- **Safety:** login locks for 15 minutes after 5 wrong passwords (`Users.Failed Logins`, `Locked Until`); security headers and a Content-Security-Policy in `vercel.json` (verify previews play on the first preview deploy); `.github/workflows/ci.yml` runs typecheck, lint, tests, build and a production-dependency audit on every push; the Vercel region is pinned near Airtable (`iad1`). Known: react-router 6 has 2 moderate advisories (open redirect via `<Link>` with user-supplied paths, which the app doesn't use; SSR hydration, not used); upgrading to v7 is a breaking change, so it is deferred. Dev-tool advisories (vitest, eslint, tailwind build chain) don't ship to users.

### Gotchas

- `scripts/airtable/manifest.json` (this base's table IDs) is **git-ignored** so the public repo carries no Airtable IDs. The running app doesn't read it, only `airtable:apply` / `airtable:seed` do (it is their safety list of tables this project created). On a new machine copy it across; without it `airtable:apply` stops and refuses to touch existing tables.

- `tsconfig.app.json` must keep `"noEmit": true`: a build that emits `.js` next to `.ts` makes Vite and Vitest load stale copies.
- Airtable has no transactions or triggers: the job queue claims with a Lock ID read-back; derived state (statuses, supersede, logs) is written by the jobs and routes.
- One-off data fixes run as `npx tsx <file>.tmp.mts` from the repo root (load `.env.local` via `scripts/airtable/lib.mjs`), then delete the file.

## Non-negotiable rules

1. **Approval gate.** A post can reach n8n/Metricool only if its Content Item status is `approved`. Airtable has no triggers, so this is enforced twice: in the UI, and in the server right before dispatch (the dispatch job re-reads the item from Airtable). Never remove or bypass either. If approved content is edited, it returns to `draft` and any queued or scheduled post for it must be updated or cancelled.
2. **Secrets stay server-side.** The browser gets no environment values and never talks to Airtable or any external API. Every call (Airtable, Claude, SerpAPI, Dropbox, Bannerbear, Resend, n8n) happens in `server/` using `process.env`.
3. **Schema changes go in `scripts/airtable/schema.mjs`,** then `npm run airtable:apply` (additive only). Never rename or delete a table, field or select option the app uses; add new ones. Update `src/types/api.ts` and `server/mappers.ts` in the same change.
4. **Every route checks the caller.** `requireUser(req, roles)` (or `requireCron`) is the first line of every handler in `server/router.ts`; the UI's role guards are UX only.
5. **Prompts live in Airtable.** Load them from the `Prompts` table by Key (the Active version). Never hard-code the client's prompt text. The app appends the output-format block (see `docs/prompts.md`).
6. **Validate every Claude response.** Parse it as JSON and validate with zod. On invalid output, retry once with the validation error appended; then fail the job with a readable error.
7. **Slow work runs as jobs.** Anything that calls Claude, Bannerbear, Dropbox or n8n goes through `enqueue()` (`server/jobs/queue.ts`) and the `Jobs` table. The UI polls for progress. It never waits on a long HTTP call.
8. **Webhooks are idempotent.** Dropbox, Bannerbear and n8n callbacks can arrive twice or out of order. Handle repeats safely: check the current state before changing it, and use unique keys (`dropbox_file_id` + `rev`, `bannerbear_uid`, `scheduled_posts.id`).
9. **Verify every inbound webhook.** Dropbox: `X-Dropbox-Signature` HMAC. n8n: shared-secret header. Bannerbear: secret in the webhook URL (and its header, if provided). Reject anything unverified.
10. **Identify Dropbox files by file ID,** not by path. Paths change when people rename or move files.
11. **Store times as UTC ISO strings** (Airtable dateTime fields in UTC). Display and schedule in `settings.timezone` using date-fns-tz. Scheduling math lives in one pure, tested module (`src/lib/schedule.ts`, imported by the server too).
12. **Statuses are defined once.** The select options in `scripts/airtable/schema.mjs` (ENUMS) are the source; `src/lib/status.ts` mirrors them with labels and colours. Don't invent a status without a schema change and a doc update.
13. **Log everything that matters.** Every state change → `Activity Log`. Every Claude, Bannerbear or SerpAPI call → `Usage Log` (tokens, cost, duration).
14. **Mock mode.** When `MOCK_EXTERNAL=true`, the Claude, SerpAPI and Dropbox clients return fixtures from `server/fixtures/` (Airtable is still real). The whole app must be usable end-to-end in mock mode.
15. **Open questions: don't guess.** If behaviour depends on an item in `docs/open-questions.md`, implement it as a configurable setting with the documented default, and leave `// TODO(OQ-<n>)` at that spot.
16. **Keep docs in sync.** If you change behaviour, update `docs/spec.md` (and any other affected doc) in the same change.

## How to work in this repo

- **One phase at a time.** Start each phase by restating its tasks from `docs/build-plan.md` and listing the files you'll touch. Finish with its "done" checklist.
- **Small, reviewable steps.** Schema (`schema.mjs` + `airtable:apply`) first, then server (schemas, jobs, routes), then UI.
- **Test pure logic thoroughly:**
  - schedule computation and time zones
  - business-day SLA math
  - status transitions
  - caption validation (limits and hashtags)
  - Dropbox path → project and role mapping
  - approval-token handling
- **Ask when ambiguous.** Stop and ask rather than widening scope. v1 excludes The Pause, the podcast, comment replies, analytics and Google Ads. (Poll questions were added on request on 2026-10-14; posting them stays manual.)

## UI guidelines

The reference design (6 screens) was shared with the client as a design canvas; the screens are listed in `docs/spec.md` §7.

- **Layout:** fixed dark sidebar (232px), content area with 40px side padding.
- **Colours:**

  | Token | Hex |
  |---|---|
  | ground | `#F5F6FA` |
  | surface | `#FFFFFF` |
  | line | `#E3E6EE` |
  | ink (text, sidebar) | `#12172B` |
  | muted text | `#4B5365` |
  | accent (indigo) | `#4338CA` on soft `#EEF0FF` |
  | success | `#15803D` on `#E8F6EC` |
  | warning | `#92400E` on `#FEF3C7` |
  | danger | `#B42318` on `#FEE4E2` |
  | info / "trending" | `#5B21B6` on `#EDE9FE` |
  | "owner" source | `#9A3412` on `#FFEDD5` |

  (Restyled 2026-10-22 from the earlier beige / teal look; the tokens live in `tailwind.config.ts`.)
- **Fonts:** Inter for headings and UI text, JetBrains Mono for IDs, scores, counters and paths. The product name is written **TrueU.ai**.
- **Accessibility:**
  - real buttons, links and labels
  - 44px minimum touch targets
  - text contrast ≥ 4.5:1
  - never convey status by colour alone (always pair it with a label)

## Glossary

| Term | Meaning |
|---|---|
| **Topic** | A video idea from any source. It is scored before anything else happens. |
| **Project** | A selected topic: one long video, 3 shorts and everything generated from them. |
| **Cycle month** | The month a project was selected for (`projects.cycle_month`). |
| **Version** | Each generation or edit of a script, blog or newsletter is a numbered version. One is approved. |
| **Caption set** | One run of a multi-item prompt (social captions, YouTube metadata, CTAs, polls), with its Content Items. Regenerating all creates a new set; the old one is superseded. |
| **Asset** | A file detected in Dropbox (long video, short_1..3, thumbnail, graphic). |
| **Content item** | One piece of platform content: caption + hashtags + media, e.g. "Short 2 on TikTok". |
| **Scheduled post** | A content item placed at a date and time, and its publishing state. |
| **Schedule template** | The reusable 15-day plan of which asset goes where and when. |
| **Day 1** | The first day of a project's posting cycle (a Tuesday by default). |
| **SLA** | Business-day reminder and escalation timers for the owner and the editor. |
