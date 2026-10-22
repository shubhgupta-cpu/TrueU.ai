# Build plan

Work one phase at a time. Each phase ends with its "done" checklist passing, plus `typecheck`, `lint` and `test`. Run everything in mock mode (`MOCK_EXTERNAL=true`) first, then against real services in staging.

## Phase 0: Foundation
- Vite + React + TypeScript + Tailwind + shadcn/ui; ESLint + Prettier; Vitest.
- Supabase CLI init; apply migrations `0001` and `0002`; generate types.
- App shell: sidebar, routes (empty pages), auth (login, protected routes, role guard).
- `_shared`: env loader, `log.ts`, `mock.ts`, fixtures folder, CORS helper, JWT/role check helper.
- `job-worker` skeleton plus the `claim_jobs` flow; cron wiring documented in `supabase/README.md`.
- **Done:**
  - [ ] login works
  - [ ] a staff user sees the empty shell
  - [ ] a dummy job goes queued → succeeded and is visible via Realtime

## Phase 1: Topics
- Submit topic form; `submit-topic`.
- `score_topic` job with `runPrompt` (Claude client + zod + retry + usage logging).
- Inbox list, filters, stat cards, detail panel, actions (select, save, reject, rescore).
- `generate_topics` (button + monthly cron) and `pull_trends` (SerpAPI client, `trend_to_topic`, weekly cron); seed keyword manager.
- Duplicate check (`pg_trgm`).
- Prompt manager v1: list, edit (new version), activate, test run.
- **Done:**
  - [ ] all 3 sources create scored topics
  - [ ] changing the threshold changes classification on the next score
  - [ ] prompts are editable in the UI

## Phase 2: Projects, script and approvals
- `select-topic` → project → `setup_project` (Dropbox client: folders, shared link).
- `generate_script`; Script tab (scenes, versions, compare, manual edit, regenerate full or scene with notes).
- Dropbox write-back of versions and APPROVED .md/.docx.
- Approval tokens; Resend client and templates; `/approve/:token` page; `approval-action`; in-app approve.
- `on_script_approved` → editor handoff email → SLA timer; `cron-sla-check` with reminder and escalation emails.
- Project overview, stepper, activity timeline; Pipeline board v1.
- **Done:**
  - [ ] email approve and request-changes both work without login
  - [ ] tokens are single-use
  - [ ] the editor email arrives with the .docx attached and the folder link
  - [ ] SLA reminders are unit-tested

## Phase 3: Dropbox detection, blog and newsletter
- `dropbox-webhook` (challenge + signature); `dropbox_sync` with cursor; asset upsert; role rules; validation; settle check; `videos_ready`.
- Videos tab with 4 slots, role reassignment, replaced-file notice; preview through `dropbox-media-link`.
- Stable media URL strategy (OQ-3).
- `generate_blog` and `generate_newsletter`; Blog and Newsletter tabs (edit, versions, approve); Dropbox write-back; import-from-Dropbox prompt.
- **Done:**
  - [ ] 4 uploads in any order → `videos_ready` exactly once
  - [ ] a duplicate webhook causes no duplicate rows
  - [ ] a replaced short is flagged

## Phase 4: Content Pack, previews and graphics
- Schedule template read (for slot list) → `generate_content_pack` (captions per asset, YouTube metadata).
- Content Pack screen: asset tabs, platform tabs, editor, validation, quick rewrites, approve per item / asset / all.
- Preview components for all platforms, blog and newsletter.
- Bannerbear: template sync, mapping UI, `generate_graphics`, `bannerbear-webhook`, `store_graphic`; Graphics screen.
- **Done:**
  - [ ] one content item per template slot
  - [ ] validation blocks approval
  - [ ] editing one graphic layer re-renders only that graphic

## Phase 5: Scheduling and publishing
- `schedule.ts` (pure, tested incl. DST); Day 1 suggestion; `schedule_project`.
- Project schedule timeline (drag, edit time), month calendar with clash warnings; Schedule templates editor in Settings.
- `publish-dispatch` / `dispatch_post` (n8n client), `publish-callback`, approval-cutoff handling, retry, update and cancel.
- Blog `{{youtube_embed}}` resolution after YouTube publishes.
- **Before starting:** get the real n8n workflows and URLs, and update `docs/integrations.md` §6.
- **Done:**
  - [ ] the DB trigger rejects dispatch of unapproved items
  - [ ] end-to-end with the n8n staging workflow: schedule → callback `scheduled` → callback `published`

## Phase 6: Admin and polish
- Settings screens for every key; Integrations status page; Jobs admin (retry, cancel); Usage and cost page.
- Notifications bell; optional weekly digest email.
- Accessibility pass, empty and loading states, error messages, performance check (500 topics / 50 projects).
- **Done:**
  - [ ] all spec acceptance criteria pass
  - [ ] a staging dry run of one full topic cycle succeeds
