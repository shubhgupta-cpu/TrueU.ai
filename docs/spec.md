# TrueU Content Cockpit — Product Specification

Version 1.0 · 30 Sep 2026 · Status: draft for client review

## 1. Overview

### 1.1 Goal
One web app that takes a video topic from idea to scheduled posts on every platform, with the owner approving each step. It replaces the current mix of Airtable, Make.com and n8n for everything except the final Metricool posting, which stays in the existing n8n/Make automations.

### 1.2 Output per topic (default)
- **Video:** 1 long YouTube video and 3 shorts, recorded and edited by the team; files arrive in Dropbox.
- **Script:** 1 script with 8 scenes, a storyboard, a B-roll table and 3 clip timestamps.
- **Metadata and captions:**
  - YouTube metadata for the long video
  - 24 social posts (see `publishing-schedule.md`), each with its own caption and hashtags
- **Long-form text:** 1 blog post and 1 newsletter.
- **Graphics:** N graphics from the client's Bannerbear templates (count per OQ-9).

### 1.3 In scope (v1)
Topic intake, scoring, selection, script generation and approval, editor handoff, Dropbox detection, blog, newsletter, content pack, Bannerbear graphics, previews, scheduling, hand-off to n8n, SLA reminders, prompt manager, settings, logs.

### 1.4 Out of scope (v1)
- The Pause monthly essays
- Podcast (NotebookLM / Transistor)
- Poll generation
- Comment monitoring and replies
- Sentiment reports
- Performance analytics
- Google Ads / Demand Gen
- Pikzels thumbnails
- Multi-language content
- Email nurture sequences

The data model should not block adding these later.

## 2. Users and roles

| Role | Who | Can |
|---|---|---|
| `owner` | The client | Everything except admin settings: submit and select topics, edit and approve all content, schedule |
| `admin` | Developer / agency | Everything, including prompts, settings, integrations, logs and retries |
| `editor` | Video editor | Optional login: sees assigned projects, approved scripts and upload status. Mostly works through email and Dropbox. |

- **Accounts:** by invite only; public sign-up is disabled.
- **Email approvals:** approval links in emails work without login (§5.7).

## 3. End-to-end flow

1. **A topic arrives,** from the in-app form (owner), the monthly Claude batch, or the weekly SerpAPI trend pull. Status `new`.
2. **Auto-scoring.** A `score_topic` job runs, giving `qualified` (score ≥ threshold) or `needs_work` (score < threshold, with suggestions).
3. **Selection.** The owner selects a qualified topic in the Inbox. A project is created, and the Dropbox folder tree and a shared link are created.
4. **Script.** Script v1 is generated, and an approval email goes to the owner. Status `awaiting_script_approval`.
5. **Owner decision.**
   - Approve, by email or in the app: the script is saved to Dropbox as approved, and the editor handoff email is sent. Status `sent_to_editor` → `awaiting_videos`.
   - Request changes: a new version is generated with the notes, and a new approval email is sent.
6. **Blog and newsletter.** Generated in parallel as soon as the script is approved.
7. **Editor uploads.** The editor uploads 1 long video to `04_Long_Video/` and 3 shorts to `05_Shorts/`. The Dropbox webhook detects them; when all 4 are present and settled, the project moves to `videos_ready`.
8. **Content pack.** Captions, hashtags and YouTube metadata are generated for every scheduled platform slot, plus graphics copy and Bannerbear renders. Status `content_review`.
9. **Review.** The owner reviews previews and approves items one by one or all at once.
10. **Scheduling.** The owner confirms Day 1, and scheduled posts are created from the template. Each approved post is sent to n8n, which schedules it in Metricool and calls back with the Metricool post ID.
11. **Published.** n8n reports each post as published with its URL. When every post is published, the project status becomes `published`.

## 4. Status lifecycles

The Airtable single-select options are the source of truth; see `ENUMS` in `scripts/airtable/schema.mjs`.

### 4.1 Topic (`topic_status`)
`new → scoring → qualified | needs_work`

- From `qualified` or `needs_work`, the owner can move a topic to `selected`, `saved` or `rejected`.
- `saved` topics return to the pool each month (rescoring is optional, per OQ-7).
- If scoring fails, the topic goes to `error`, and the owner can retry.
- A topic that scores `needs_work` is rewritten once automatically (F3.6). The rewrite is a new topic, linked by `regenerated_from`, that arrives already scored (`qualified` or `needs_work`).

### 4.2 Project (`project_status`)
```
selected → script_draft → awaiting_script_approval
   ↺ (changes requested → script_draft)
→ script_approved → sent_to_editor → awaiting_videos → videos_ready
→ content_generating → content_review → scheduling → scheduled → published
(any) → on_hold | error
```

### 4.3 Script, blog and newsletter versions (`version_status`)
`generating → draft → awaiting_approval → approved | changes_requested`

- When a version is approved, all earlier versions become `superseded`.
- Only one version per document is `approved` at a time.

### 4.4 Content item (`item_status`)
`generating → draft → approved`

- A validation failure sets `needs_edit`.
- `rejected` is used when the owner drops the item.
- Editing an approved item sets it back to `draft` (see the approval-gate rule).

### 4.5 Scheduled post (`publish_status`)
```
planned → waiting_approval → queued → sent → scheduled → published
                                   ↘ failed (retry) ↘ cancelled
```

| Status | Meaning |
|---|---|
| `planned` | The slot exists; no content item is linked yet. |
| `waiting_approval` | The content item exists but isn't approved yet. |
| `queued` | Approved and waiting for dispatch. |
| `sent` | The webhook has been delivered to n8n. |
| `scheduled` | n8n confirmed with a Metricool post ID. |
| `published` | n8n confirmed the post is live, with its URL. |

### 4.6 Graphic (`graphic_status`)
`queued → rendering → ready → approved`

- `needs_edit` covers text overflow or an owner edit.
- `failed` covers a Bannerbear error.

## 5. Features and acceptance criteria

### 5.1 Auth and roles (F1)
- **F1.1** Email and password login. Accounts are invite-only: an admin creates them with `npm run user:create -- <email> <role> ["Name"]`, which writes the `Users` record with a scrypt password hash (running it again resets the password). There is no sign-up and no magic link.
- **F1.2** The session is a signed, HttpOnly cookie valid for 14 days. The role is re-read from `Users` on every request; clearing `Password Hash` in Airtable signs the user out.
- **F1.3** Every API route checks the role; editors see only projects where they are the `Editor` (later phase).
- **Done when:** a non-staff user cannot read any topic, prompt or setting through the API.

### 5.2 Topic intake (F2)
- **F2.1 Submit topic form.** Fields: title (required, ≤120 chars), description, category (from `settings.topic_categories`) and notes. Creates `source='owner'`, `status='new'`.
- **F2.2 Claude batch.**
  - **When:** cron on the 1st Monday of each month at 09:00 (settings tz), plus a manual "Generate with Claude" button.
  - **Prompt:** `topic_generate`, with brand context, recent titles (last 6 months) and saved topics.
  - **Output:** `settings.claude_topics_per_batch` topics (default 15), created as `source='claude'`.
- **F2.3 SerpAPI trends.**
  - **When:** weekly cron (Mon 08:00), plus a "Pull trends" button.
  - **Search:** each active `seed_keywords` row through Google Trends, YouTube search and Google "related questions".
  - **Turn into topics:** raw trends go through the `trend_to_topic` prompt, which returns topic ideas.
  - **Save:** created as `source='trending'`, with `source_detail` = `{keyword, angle, trend_reason, items: [{engine, query, value?, url?}] (top 5), fetched_at}`.
- **F2.4 Duplicate check.** Before insert, compare the normalised title with topics from the last 12 months (trigram similarity > 0.6). Duplicates are still inserted, but `duplicate_of` is set and a badge is shown.
- **F2.5 Seed keyword manager** in Settings: add, disable and delete keywords.
- **Done when:** all three sources create topics, and each new topic enqueues a scoring job automatically.

### 5.3 Topic scoring (F3)
- **F3.1 Automatic scoring.** A `score_topic` job runs on insert of any topic with status `new`.
- **F3.2 Prompt output.** The `topic_score` prompt returns the client's evaluation JSON (`docs/prompts.md` §2.1): six criteria scored 1–10 (Search Intent Alignment, Personal Consequence, Fear + Curiosity Hook, Specific Person Targeting, Urgency / Timing, Platform Invitation), a total out of 60, a recommendation (GREENLIGHT / REFINE / REJECT), ICP alignment, trigger moment, improvements with `+X pts`, a storyboard (when ≥ 45) and a 3-sentence summary.
- **F3.3 Storage and status.** Results are stored in `topic_scores` (full JSON in `evaluation`, normalised rows in `criteria`, format slips in `warnings`), and the topic's `score_total` and `latest_score_id` are updated. Rescoring a `selected`, `saved` or `rejected` topic records the score but keeps its status.
  - `qualified` if total ≥ `settings.score_threshold` (default 45) out of `settings.score_max` (default 60).
  - Otherwise `needs_work`.
- **F3.4 Rescore.** Available on demand; each run is kept as a new `topic_scores` row, giving a history.
- **F3.5 Failures.** After 2 failed attempts the topic is set to `error` with a readable message and a retry button.
- **F3.6 Automatic improvement.** When a topic scores below the threshold and `settings.auto_regenerate_topics` is on (default), a `regenerate_topic` job runs the client's `topic_regenerate` prompt once with the score's improvements. The rewritten topic is added as a new topic (`regenerated_from` → original), scored by the same response. The automatic rewrite happens at most once per topic, and automatic rewrites are never rewritten again. Both appear in the Inbox, linked to each other.
- **F3.8 Short titles.** Titles written by the app (rewrites, Claude topics, trend topics) are 5–6 words, never more than 8; a longer one fails validation and is retried with the error. `topic_regenerate` v3 carries an app-added `<title_rule>`. Owner-typed titles are not changed.
- **F3.7 Regenerate from suggestions (manual).** Any scored topic below the threshold (including earlier rewrites, saved and rejected topics; not while scoring or once selected) shows a **Regenerate from suggestions** button. It runs the same `regenerate_topic` job with `manual: true`: the latest score's suggestions go to `topic_regenerate`, and the result is a new, already-scored topic linked to the original. There is no limit on manual rewrites; one can run per topic at a time. While it runs, the topic shows "Rewriting…" in the list and detail panel.
- **Done when:** the score breakdown in the UI matches the stored JSON, and the threshold change in Settings applies to the next scoring.

### 5.4 Topic Inbox and selection (F4)
- **F4.1 List.**
  - **Filters:** source, status, category, month.
  - **Search:** title.
  - **Sort:** score (default), date.
- **F4.2 Stat cards:** awaiting score, qualified, needs work, selected this month (x / `settings.videos_per_month`).
- **F4.3 Detail panel:**
  - source badge and topic number
  - title and score, with the per-criterion bars and reasoning
  - recommendation, ICP alignment, trigger moment, summary, and the score date (OQ-7)
  - suggestions (for needs_work) and the storyboard (when filled)
  - links between a topic and its improved version; format warnings, if any
  - score history (earlier scores)
  - source details (for SerpAPI topics: keyword, engine, link)
  - owner notes
- **F4.6 Topic page (built 2026-10-14).** Clicking a topic in the Inbox opens `/topics/:id` with the full detail and, once selected, everything generated for it. The Inbox is a full-width list and shows the result of the last **Generate with Claude** / **Pull trends** run (running / added N / failed: reason).
- **F4.7 Delete.** Any topic can be deleted after confirmation: the topic, its scores and, if selected, its project and every generated record in Airtable; pending jobs are cancelled. Dropbox files and the history tables (Activity Log, Approvals, Usage Log) are kept.
- **F4.4 Actions:** Select, Save for later, Reject, Rescore, Regenerate from suggestions (F3.7), Delete (F4.7), Edit title/description (editing triggers a rescore prompt). Select, Save and Reject are offered for `qualified` and `needs_work` topics; `saved` topics can be selected or rejected. Select creates the project (F5) and starts the Dropbox setup and the script; the topic then links to its project.
- **F4.5 Monthly cap.** Selecting beyond the monthly slots asks for confirmation, but doesn't block.
- **Done when:** selecting a topic creates exactly one project and shows it in the Pipeline.

### 5.5 Project setup (F5)
- **F5.1 Create the project.** `cycle_month` is the current month; `sequence` is the next number in that month; the slug comes from the title.
- **F5.2 Dropbox folders.** In the team space, create `/Year - {YYYY}/{Month} {YYYY}/{Topic name}/` (e.g. `/Year - 2026/October 2026/AI Surveillance/`). The year and month folders are created when missing, so a new year or month starts its own folders automatically; existing ones are reused. The topic name is the topic title minus characters Dropbox rejects, up to 80 characters. Subfolders (all names and the pattern live in `settings.dropbox`, so they can change without code):

  `B_Roll`, `Backgrounds`, `Bannerbear Images all Platforms`, `Blog_Script`, `Chat Reel Video`, `Clips for Editor`, `FINAL`, `Graphics`, `Long Youtube Final Video`, `Podcast`, `RAW`, `Resize Video`, `Script` (script versions go here), `Short Final Video`, `Thumbnail`.

  Store the folder path and folder ID. Existing folders are reused (idempotent).
- **F5.3 Shared link.** Create a Dropbox shared link for the project folder and store it.
- **F5.4 Script generation** is enqueued immediately after setup. If the Dropbox setup fails (or Dropbox isn't connected yet), the script is still generated and kept in Airtable; the project page shows the error and a **Retry Dropbox setup** button, which creates the folder and uploads any script not yet there.
- **Done when:** running setup twice produces no duplicate folders or errors.

### 5.6 Script (F6)
- **F6.1 Generation.** The `script_generate` prompt (the client's Storyboard Creation Prompt) returns the full episode package (docs/prompts.md §3):
  - 8 scenes: Opening Examples, Context and Tension, Emotional Root, Bridge Questions, Common-Ground Reframe, Reflection Bridge to CTA, Topic-Specific CTA, Branded Outro — with narration, on-screen text, B-roll, background, camera, music and emotional beat
  - opening examples, narrator backgrounds, closing reflection and transition notes
  - 6 short-form clip scripts and YouTube title, description, tags, hashtags and thumbnail concept
  - 3 clip timestamps that become Short 1–3
  - brand-rule warnings from the prompt's self-check, shown next to the script
- **F6.2 Script screen:**
  - scene list with timings and "Clip n" badges
  - version selector and compare view (side-by-side diff)
  - manual edit, which creates a new version with source `manual`
- **F6.3 Regenerate / request changes.** The owner reviews the newest version (on the project page, or in the Inbox by opening the selected topic, "Script review") and can request changes with optional notes. This runs `script_generate` again with the notes as `{{notes}}` and creates a new version; the reviewed version is marked `changes_requested` (recorded in Approvals) and every earlier version becomes `superseded`. Single-scene regeneration with `script_regenerate` is not built yet.
- **F6.4 Dropbox.** Every version is written to `Script/script_vN.docx` (Word: every section of the storyboard, in order) and `script_vN.md`, by the `export_script` job; an upload failure shows **Retry upload** without regenerating. Only the current script stays in the folder: once a new version is uploaded, the older versions' files are deleted from Dropbox (they remain in Airtable as history and in Dropbox's deleted files), and so is an earlier `script_APPROVED` copy. Approving a version writes `Script/script_APPROVED.docx` (and `.md`).
- **Prompt variables (`script_generate`):** `topic`, `episode_title` and `shared_value` (from the topic score's storyboard), `notes` (regeneration notes). See docs/prompts.md §3.
- **F6.5 Clips.** The 3 clip timestamps are used to label the shorts (Short 1–3) and are included in the editor email.
- **Done when:** approving v2 supersedes v1, both files exist in Dropbox, and the editor email contains v2.

### 5.7 Approvals and email (F7)
- **F7.1 Script approval email** (template `script_approval`), sent to all `settings.team.owner_emails`. It contains:
  - title, score and version
  - the hook line and scene names
  - which scenes are marked as clips
  - buttons: **Approve script**, **Request changes**, and "Open in Cockpit"
- **F7.2 One-click links.**
  - Each link carries a signed, single-use token, stored hashed in `approval_tokens`.
  - Expiry: `settings.approval_link_ttl_days` (default 14).
  - "Approve" opens a confirmation page (`/approve/:token`) with a single confirm button. Links scanners or email previews might follow don't approve anything on their own.
  - "Request changes" opens a notes form.
  - A used or expired link shows a friendly message and a link to log in.
- **F7.3 Changes requested.** Stores the notes, sets the version to `changes_requested`, enqueues regeneration with the notes, and sends a new approval email when ready.
- **F7.4 Editor handoff email** (template `editor_handoff`), sent automatically on approval to `projects.editor_id`'s email, or to `settings.team.editor_emails`. It contains:
  - the approved script, attached as .docx and linked
  - the Dropbox shared link
  - the upload rules: exactly 1 file in `04_Long_Video/`, and exactly 3 files in `05_Shorts/` named `short_1`, `short_2`, `short_3`
  - the clip timestamps
- **F7.5 In-app approval** of scripts, blog, newsletter, content items and graphics (for logged-in owner or admin). Scripts: **Approve script vN** on the newest `draft` version (not while a new version is being written) sets it `approved`, the project `script_approved`, and runs `on_script_approved` (writes the APPROVED files; TODO: editor handoff, pending how the editor should receive it). Regenerating after approval replaces the approved script, which then needs approving again. Every decision is recorded in `approvals`, with `via` (`app` or `email`) and who made it.
- **F7.6 Email log.** Every email is stored in `emails`. Delivery, open and click events come from Resend webhooks.
- **F7.7 Other email templates:** `sla_reminder`, `sla_escalation`, `content_ready_for_review`, `publish_failed`, `weekly_digest` (optional, OQ-11).
- **Done when:** the full approve → editor-email path works from an email link without login, and replaying the same link does nothing.

### 5.8 Dropbox integration (F8)
- **F8.1 Connection.** Dropbox app with scoped access and an offline refresh token. Access tokens are refreshed automatically and cached until expiry.
- **F8.2 Webhook** (`dropbox-webhook`).
  - Answers the GET challenge.
  - Verifies the POST signature (HMAC-SHA256 of the body with the app secret).
  - Enqueues a single `dropbox_sync` job; repeat notifications merge into one pending job.
- **F8.3 Sync job.**
  - Calls `list_folder/continue` from the stored cursor (`dropbox_sync.cursor`), with `list_folder` recursive on the root the first time.
  - Maps each changed path to a project (by folder ID or path prefix) and a role (by subfolder and file name).
  - Upserts `assets` by `dropbox_file_id` + `rev`, then saves the new cursor.
- **F8.4 Role rules.** (Folder names per F5.2: the long video is in `Long Youtube Final Video/`, shorts in `Short Final Video/`. TODO: confirm with the client.)
  - `04_Long_Video/*` → `long_video`.
  - `05_Shorts/*` → a file name containing `short_1`, `short_2` or `short_3` gets that role. Otherwise roles are assigned in upload order, and the owner can reassign them in the UI.
- **F8.5 Validation checks:**
  - **Type:** video extensions only (mp4, mov, m4v).
  - **Size:** greater than 1 MB.
  - **Count:** no more than 1 long video and 3 shorts; extra files are flagged, not dropped.
  - **Settle time:** a file is "settled" when its `rev` hasn't changed for `settings.dropbox_settle_minutes` (default 5).
- **F8.6 Videos ready.** When all 4 required roles have a current, settled asset, the project moves to `videos_ready` and the content-pack generation job is enqueued.
- **F8.7 Re-upload.** A new `rev` for an existing role marks the old asset `is_current=false`. The UI shows "Short 2 was replaced", with an option to regenerate that short's content items.
- **F8.8 Stable media URLs.** Per OQ-3:
  - Preview in the UI with `get_temporary_link` (fetched on demand, about 4 hours).
  - For publishing, store a long-lived direct-download URL in `assets.stable_url`: a Dropbox shared link with `dl=1`, or a copy in Supabase Storage.
- **F8.9 Write-back.** Script, blog and newsletter versions, exports and graphics are uploaded to their subfolders, and the `rev` is stored.
- **F8.10 Manual Dropbox edits.** If a `.md` in `01`–`03` changes and its `rev` doesn't match what the app wrote, the owner is offered "Import as new version" (source `dropbox_import`). Nothing is overwritten automatically.
- **Done when:** uploading 4 files in any order results in `videos_ready` exactly once, and re-sent webhooks cause no duplicates.

### 5.9 Blog and newsletter (F9)
- **F9.1 Blog.** Generated automatically when the script is approved (`on_script_approved` → `generate_blog`), by the client's **Blog Post Generator v1.0** (`blog_generate`). It returns title, meta description, slug, primary keyword, an introduction, 3–5 H2 sections, the TrueU.ai section (placed after 2–3 body sections), conclusion, CTA box, SEO links and a featured-image idea, plus a category (docs/prompts.md §2.3). 1,500–2,000 words. The prompt's validation checklist is applied as warnings next to the blog. (The `{{youtube_embed}}` placeholder is not part of this prompt; TODO: decide with the client whether the YouTube link is added at publishing.)
- **F9.2 Newsletter.** Generated by `newsletter_generate`. Returns subject, preview text and markdown body.
- **F9.3 Review.** In the Inbox (open the selected topic, "Script & blog review") or on the project page, the owner reads the blog and can **Approve**, **Reject** (no new version; regenerate later) or **Regenerate** with optional notes (the reviewed draft becomes `changes_requested`; earlier versions `superseded`). Every decision is recorded in Approvals. Only the **approved** blog goes to Dropbox: `on_blog_approved` writes `{topic folder}/Blog_Script/blog_APPROVED.docx` and `.md` (`settings.dropbox.blog_folder`). Regenerating after approval replaces it: the approved file is removed from Dropbox and the new version needs approving. Manual editing in the app is not built yet.
- **F9.4 Before publishing.** `{{youtube_embed}}` is replaced with the live YouTube URL once the long video's post reports `published`. Blog publishing waits for that.
- **Done when:** the blog can't be scheduled while the placeholder is unresolved, unless the owner overrides it.

> **Update 2026-10-22 (editor's transcript):** the editor puts a transcript file (PDF, Word, text, SRT/VTT; times like `0:42` at the start of each line) next to the long video in Dropbox. The app reads it and writes the YouTube description and chapter timestamps from it (untimed text gives the description only). Until one exists the script is used. See CLAUDE.md.

### 5.10 Content Pack (F10)
- **F10.0 Social captions (built).** Once the approved blog is saved to Dropbox, `generate_captions` runs the client's **Social Media Content Generator v2.4** (`captions_generate`): 28 posts per topic — LinkedIn, Instagram, X/Twitter, Facebook, Pinterest and Threads with an image post plus Video 1–3 (= Short 1–3) each; a LinkedIn carousel (image only); Reels/TikTok (Video 1–3 only). Each post has its graphic text (quote / Pinterest title / carousel cover and slides), caption and exactly 3 hashtags.
  - **Airtable:** each run is a `Caption Sets` record (full JSON, version, inputs, notes); each post is a `Content Items` record linked to it (Channel, Post, Platform, Asset Role, Title = graphic text, Caption, Hashtags, Extra, Validation, Status).
  - **Checks:** the prompt's limits and hashtag policy per post (caption length per platform, graphic limits, 3 space-separated hashtags starting #TrueUai, none in captions, no em dashes, forbidden terms) and #ThinkingPartner in ~80% of posts. A post that breaks a rule is `needs_edit` and shows why.
  - **Review** (topic panel "Script, blog & captions", or the project page): a tab per platform; **Approve** or **Reject** (optional reason) each post, or **Approve all pending**. Every decision is recorded in Approvals.
  - **Regenerate** with optional notes: only the selected platform (its posts are replaced in the current set) or all platforms (a new set; earlier posts superseded, approvals start over).
  - **Inputs:** content_title (script episode title), content_type `video`, topic_name, decision_domain, key_message (the script's connecting statement + closing reflection), content_url (`settings.social_content_url`, `{slug}` = blog slug; TODO: confirm the blog URL), weekly_hashtags (`settings.weekly_hashtags`, else the script's YouTube hashtags).
  - Captions are not written to Dropbox. Bannerbear graphics are separate (below).
- **F10.0c CTAs & hooks (built).** Also after blog approval, `generate_ctas` runs the client's **CTA and Hook Generation Agent v3.7** (`cta_generate`) once: email / lead-magnet / blog / subscribe CTAs for the YouTube description, the pinned-comment CTA, and per platform the image text (LinkedIn / X / Facebook quotes, Instagram label + title + reel overlay, Pinterest title + points) and caption / comment / bio CTAs. Stored as a `Caption Sets` record (Kind `cta`) with 7 `Content Items` (Channel `cta`, `CTA Group`; Extra = the fields; Caption = a readable list). Checks: target lengths (+2 to finish a word), no em dashes, Instagram label ALL CAPS, reel overlay = 3 words + arrow without emoji, X handle plain words. Inputs: episode title, blog category, key points (script statements + clip hooks), `settings.lead_magnet` (empty = none), `settings.blog_url` (TODO: confirm the blog URL), icp_segment empty (brand ICP).
- **F10.0d Polls (built; added 2026-10-14).** Also after blog approval, `generate_polls` runs the client's **Poll Question Generator v1.0** (`poll_generate`): 5 Yes/No questions (category, expected split, why engaging, platform note). For LinkedIn, X, Instagram, TikTok and Facebook (the prompt rules out YouTube). Stored as a `Caption Sets` record (Kind `poll`) with 5 `Content Items` (Channel `poll`, Occurrence 1–5, Caption = question, Title = category). Checks: under 120 characters, phrased as a question, categories not repeated. Approved polls get **Posted on** checkboxes per platform (`Posted On`) and `Results Notes`, editable in the app or Airtable. Posting is manual.
- Both have approve/reject per item, approve all pending, and regenerate (a new set) with notes; before the first set, a **Generate** button once the blog is approved.
- **F10.0b YouTube metadata (built).** When the blog is approved (together with the social captions; decision 2026-10-14), `generate_youtube` runs the client's **YouTube SEO Metadata Generator v2.0** (`youtube_metadata_generate`) once per video — the long video and Short 1–3 — in parallel, from the approved script only: 5 title options with a recommended one, a 2,000–5,000-character description (timestamps for the long video, the About TrueU.ai and Connect sections, 3–5 hashtags at the end), 15–20 tags and 3 thumbnail text options. Language EN (ES / PT-BR not enabled).
  - **Airtable:** a `Caption Sets` record with Kind `youtube` and one `Content Items` record per video (Channel `youtube`, Post `long_video` / `video_1..3`, Platform `youtube` / `youtube_shorts`, Title = recommended title, Caption = description, Hashtags, Extra = title options, tags, thumbnail text, SEO notes, duration).
  - **Checks:** the prompt's validation checklist (title 50–60 with the keyword, thumbnail headline ≤ 25 / subtext ≤ 40, description length, timestamps over 10 minutes, About TrueU.ai, Thinking Partner, 15–20 tags, hashtags). Flagged videos are `needs_edit`.
  - **Review / regenerate:** a tab per video with approve/reject, approve all pending, and regenerate one video or all four (a new set) with optional notes. Before the first set exists (e.g. a project approved before this feature), the panel offers **Generate YouTube metadata** once the script is approved; the captions panel offers **Generate captions** once the blog is approved.
  - **Distinct titles:** each short's input says which short it is and asks for a title on its own hook; a title repeated within the set is flagged.
  - **Inputs per video:** topic title; decision domain (topic category mapped to the prompt's list: Relationships, Life Transition, else Personal Growth); duration (long: the script's runtime; short: the clip timecode length); summary ≤ 500 characters (long: episode, examples, closing reflection; short: the clip's timecode, scene and hook); key timestamps (long: the scene start times); primary keyword and up to 7 secondary keywords (topic score search phrases + the script's YouTube tags); video id `vid{YYYYMM}{NN}{0–3}`.
- **F10.1 Generation.**
  - For every slot in the project's schedule template, create a content item for that asset and platform.
  - Captions come from the `captions_generate` prompt, called once per asset with all its platforms, and return JSON keyed by platform.
  - YouTube metadata (title, description, tags, chapters) comes from `youtube_metadata_generate`.
  - Repeated platform slots for the same asset (e.g. Short 2 on Reels on Day 10 and Day 14) get separate items with different captions.
- **F10.2 Platform rules** are stored in `settings.platform_rules`: caption max length, hashtag max, "visible before more" length, and whether a link is allowed in the caption. Validation runs on every save, and results are stored in `content_items.validation`.
- **F10.3 Screen.**
  - **Asset tabs:** Long video, Short 1, Short 2, Short 3, Blog, Newsletter, Graphics.
  - **Platform tabs** with status badges.
  - **Editor:** caption, hashtags, CTA type, extra fields, per-item regenerate, and quick rewrites (Shorter, More personal, Stronger hook).
  - **Preview** alongside (F12).
- **F10.4 Approving.** Per item, "Approve all for this asset", or "Approve all". Items with warnings (`needs_edit`) show them and can still be approved by the owner (decision 2026-10-14); in-app editing of a caption is not built yet.
- **F10.5 Export.** Approved captions are written to `08_Exports/captions.md` for the record.
- **Done when:** the Content Pack for a project shows exactly one item per template slot, with correct counts per platform.

### 5.11 Graphics — Bannerbear (F11)
- **F11.1 Template sync.** An admin action pulls templates from Bannerbear (UID, name, size, preview, layers) into `graphic_templates` and `template_layers`.
- **F11.2 Mapping** in Settings, per template:
  - each layer → a content field (`hook`, `headline`, `quote`, `point_1..n`, `cta`, `title`, `background_image`, `logo`)
  - a max length per text layer
  - the template's platform, content type and brand
- **F11.3 Graphics copy.** The `graphics_copy_generate` prompt returns layer values for each template in `settings.graphics_set`, respecting the max lengths.
- **F11.4 Rendering.** Each render is sent to Bannerbear with a webhook URL; the result arrives through `bannerbear-webhook`. The image is downloaded, uploaded to `06_Graphics/{template}_{vN}.png`, and its `image_url`, `dropbox_path` and `bannerbear_uid` are stored.
- **F11.5 Grid and edit panel** (as in the reference design):
  - edit layer values inline, with counters and overflow errors
  - swap template, regenerate one graphic, "Shorten with Claude"
  - approve
- **F11.6 Posts.** Each approved graphic that maps to a platform slot becomes (or feeds) an image content item with its own caption.
- **F11.7 Usage.** Every render is logged in `usage_log` (provider `bannerbear`).
- **Done when:** editing one layer re-renders only that graphic and bumps its version.

### 5.12 Previews (F12)
- **F12.1 Components** under `src/components/previews/` for:
  - YouTube (watch page card)
  - YouTube Shorts
  - Instagram Reel and Instagram Feed
  - TikTok
  - Facebook
  - X
  - Threads
  - Pinterest
  - LinkedIn
  - Blog (desktop and mobile)
  - Newsletter (desktop and mobile)
- **F12.2 Real content.** Previews use the real media (temporary Dropbox link, or the Bannerbear image) and the real caption, truncated the way each platform truncates.
- **F12.3 Brand neutrality.** Previews are simplified, brand-neutral mockups; they don't copy platform logos or trade dress.
- **Done when:** changing a caption updates the preview live, without saving.

### 5.13 Scheduling and publishing (F13)
Full detail in `publishing-schedule.md`.

- **F13.1 Setup.** When the project reaches `content_review`, the app suggests Day 1: the next `day1_weekday` (Tuesday) that is at least `settings.min_lead_days` (default 2) days away. The owner confirms or changes it.
- **F13.2 Slots.** `scheduled_posts` are generated from the template: one per slot, with `scheduled_at` computed in the settings timezone, and linked to its content item.
- **F13.3 Schedule screen.**
  - A Day 1–15 timeline for the project, and a month calendar across projects.
  - Drag to reschedule, and edit the time.
  - Clash warnings when two posts land on the same platform within `settings.clash_window_hours` (default 3).
- **Previews built 2026-10-22:** per-platform post previews with the Dropbox video on the project page (see CLAUDE.md "Previews"). Pinterest and YouTube show the title as well.
- **Built 2026-10-22 (later the same day):** posting-week picker per topic with a 2/3/4-week spread, click-to-edit time per post, Dropbox video detection (Videos card), per-minute dispatch to the Make.com webhook and the callback (see CLAUDE.md "Schedule and calendar"). Not yet: per-platform payload fields, blog/newsletter dispatch, edits after send, clash warnings.
- **Built 2026-10-22 (F13.1–F13.3 in part):** the owner picks Day 1 on `/projects/:id/schedule` (suggested: first Tuesday at least 7 days out; non-Tuesday warns) and **Build schedule** creates the 26 `Scheduled Posts` as `planned`, in Eastern time. `/calendar` shows every project's grid. Not yet: linking posts to content items, drag-to-reschedule, clash warnings, and everything from F13.4 on (dispatch is to the client's Make.com webhook, then Metricool).
- **F13.4 Dispatch.** `publish-dispatch` sends approved (`queued`) posts to n8n, runs every 5 minutes, and also runs right after an approval.
  - A post is sent as soon as it's approved (Metricool holds the timing), not at post time.
  - Posts whose `scheduled_at` is in the past are held with an error, not posted.
- **F13.5 Changes.** Changing the time or content of a `sent` or `scheduled` post sends `update`. Removing a post sends `cancel`.
- **F13.6 Approval cutoff.** A post still unapproved `settings.publish_approval_cutoff_hours` (default 24) before its slot triggers an owner reminder. After the slot passes unapproved, it is marked `failed` with the reason "missed – not approved", for the owner to reschedule.
- **F13.7 Callbacks.** `publish-callback` receives the n8n callbacks (scheduled, published, failed) and updates the post. Failures notify the owner and show **Retry**.
- **F13.8 Blog and newsletter** are scheduled posts too (platform `blog` or `newsletter`), sent through the same n8n webhook unless OQ-5 decides otherwise.
- **Done when:** a post can never be sent if its content item isn't approved (the DB trigger rejects it), and every n8n callback is idempotent.

### 5.14 Pipeline, SLA and notifications (F14)
- **F14.1 Pipeline board.** Kanban by project stage:

  | Column | Project statuses |
  |---|---|
  | Selected | `selected`, `script_draft` |
  | Script review | `awaiting_script_approval` |
  | With editor | `script_approved`, `sent_to_editor`, `awaiting_videos` with 0 videos |
  | Awaiting videos | `awaiting_videos` with 1–3 videos |
  | Content review | `videos_ready`, `content_generating`, `content_review` |
  | Scheduled | `scheduling`, `scheduled` |
  | Published | `published` |

  Cards show the SLA state (on time, reminder sent, overdue).
- **F14.2 SLA timers** (`sla_timers`), counted in business days (Mon–Fri in the settings timezone; holidays per OQ-13):

  | Timer | Starts at | Reminders | Escalation | Error |
  |---|---|---|---|---|
  | `client_script_approval` | approval email sent | day 5 and day 8 | day 10 | — |
  | `editor_videos` | handoff email sent | day 5 and day 8 | day 10 (to the owner) | day 15 |

  A daily `sla-check` cron sends due reminders.
- **F14.3 Activity timeline** per project, read from `activity_log`.
- **F14.4 In-app notifications** (`notifications`): a bell with an unread count. Types: scoring done, script ready, videos ready, content ready, publish failed, SLA escalation.
- **Done when:** the SLA math is unit-tested across weekends and time zones.

### 5.15 Admin (F15)
- **F15.1 Prompt manager.**
  - List prompts by key; view and edit them; each save creates a new version; one version per key is active.
  - "Test run" executes against a sample input and shows the raw output and validation result, without saving.
- **F15.2 Settings** screen for every key in §8.
- **F15.3 Jobs and errors:** list, filter, view payload and error, Retry, Cancel.
- **F15.4 Usage and costs:** per project and per month, from `usage_log`.
- **F15.5 Integrations status:** Dropbox connected and last sync, Bannerbear templates synced, email domain verified, n8n last callback.

## 6. Non-functional requirements
- **Security:**
  - RLS on all tables
  - secrets only in Edge Functions
  - every webhook verified
  - approval tokens stored hashed, single-use, expiring
- **Reliability:**
  - every external call retried with backoff (3 attempts)
  - jobs are retryable
  - webhooks are idempotent
- **Auditability:** every approval and status change is logged with who, when and how.
- **Performance:** Inbox and Content Pack load in under 1.5 s with 500 topics and 50 projects.
- **Time:** all timestamps are stored in UTC and shown in `settings.timezone`.
- **Accessibility:** WCAG AA contrast and keyboard navigation.

## 7. Screens and routes

| Route | Screen | Reference design |
|---|---|---|
| `/login` | Login | — |
| `/` → `/inbox` | Topic Inbox (list + detail, submit dialog) | Screen 1 |
| `/projects/:id` | Project overview + tabs (Script, Blog, Newsletter, Videos, Activity) | Screen 2 |
| `/projects/:id/content` | Content Pack (asset tabs × platform tabs + preview) | Screen 4 |
| `/projects/:id/graphics` | Graphics grid + edit panel | Screen 6 |
| `/projects/:id/schedule` | Project schedule timeline | — |
| `/calendar` | Month calendar across projects | — |
| `/pipeline` | Pipeline board | Screen 5 |
| `/approve/:token` | Public approval confirm / request-changes page | Screen 3 is the email itself |
| `/settings/*` | General, Team, Scoring, Platforms, Schedule templates, Graphics templates, Seed keywords, Integrations | — |
| `/prompts` | Prompt manager | — |
| `/admin/jobs`, `/admin/usage` | Jobs and usage | — |

## 8. Settings keys (`settings` table, JSON values)

| Key | Default | Notes |
|---|---|---|
| `timezone` | `"UTC"` | OQ-6 |
| `score_threshold` / `score_max` | `45` / `60` | |
| `videos_per_month` | `4` | |
| `claude_topics_per_batch` | `15` | |
| `topic_categories` | `["Identity","Relationships","Values","Transitions"]` | editable |
| `team` | `{owner_emails:[], editor_emails:[], backup_approver_emails:[]}` | |
| `brand_context` | `{brand_name, voice, audience, offer, banned_phrases}` | fed to every prompt |
| `sla` | see F14.2 | |
| `approval_link_ttl_days` | `14` | |
| `publish_approval_cutoff_hours` | `24` | |
| `min_lead_days` | `2` | |
| `clash_window_hours` | `3` | |
| `dropbox` | `{root:"/TrueU", settle_minutes:5}` | |
| `platform_rules` | per-platform limits | see `publishing-schedule.md` §5 |
| `graphics_set` | list of template UIDs to render per project | OQ-9 |
| `models` | `{default, fast}` | Claude model IDs (`claude-sonnet-5-5` / `claude-haiku-5-5`) |
| `auto_regenerate_topics` | `true` | F3.6 |
| `max_trend_topics_per_run` | `10` | F2.3 cap |
| `email_from` | `"TrueU Content Cockpit <…>"` | |
