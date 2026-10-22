# Publishing schedule

Source: the client's posting plan, received 30 Sep 2026. It is stored as the default **schedule template** (seeded in `supabase/migrations/0002_default_config.sql`) and editable in Settings → Schedule templates.

## 1. The default 15-day template

- **Day 1 is a Tuesday** (`day1_weekday = 2`).
- **Times are local,** in `settings.timezone` (`America/New_York`).
- **\*** = "or best time" (`allow_best_time = true`).
- **Assumption:** Days 2–5 post Short 1; see OQ-1.

| Day | Weekday | Asset | Platform | Time | Notes |
|---|---|---|---|---|---|
| 1 | Tue | Long video | YouTube | 08:00–10:00 | |
| 2 | Wed | Short 1 | Threads | 18:00* | |
| 2 | Wed | Short 1 | Instagram Reels | 22:00* | |
| 2–4 | Wed–Fri | — | Blog | 09:00 on Day 2 (default) | must include the YouTube link |
| 3 | Thu | Short 1 | Facebook | 13:00–14:00 | |
| 3 | Thu | Short 1 | YouTube Shorts | 14:00 | "if possible" |
| 4 | Fri | Short 1 | X (Twitter) | 11:00* | |
| 4 | Fri | Short 1 | TikTok | 14:00* | |
| 5 | Sat | Short 1 | Pinterest | 10:00 | "soft" |
| 6 | Sun | Short 2 | Instagram Feed | 08:00 | OQ-3b: video or graphic? |
| 7 | Mon | Short 2 | YouTube Shorts | 13:00 | |
| 8 | Mon | Short 2 | Threads | 08:00 | |
| 8 | Mon | Short 3 | YouTube Shorts | 09:00 | |
| 9 | Tue | Short 2 | X (Twitter) | 08:00 | |
| 9 | Tue | Short 2 | Facebook | 19:00 | |
| 10 | Wed | Short 2 | Instagram Reels | 16:00 | |
| 10 | Wed | Short 2 | TikTok | 19:00 | |
| 11 | Thu | Short 3 | TikTok | 14:00 | |
| 12 | Fri | Short 3 | Instagram Feed | 10:00 | OQ-3b |
| 13 | Sat | Short 2 | Pinterest | 18:00 | |
| 13 | Sat | Short 3 | X (Twitter) | 14:00 | |
| 14 | Sun | Short 3 | Instagram Reels | 19:00 | |
| 15 | Mon | Short 3 | Facebook | 12:00 | |
| 15 | Mon | Short 3 | Pinterest | 18:00 | |
| 15 | Mon | Short 3 | Threads | 20:00 | |
| 8 | Mon | — | Newsletter | 10:00 | |

**Totals per topic:** 24 social posts (1 long, Short 1 × 7, Short 2 × 8, Short 3 × 8) + blog + newsletter = 26. Updated 2026-10-22 from the client's calendar image (Short 2/3 swaps, newsletter Day 8). Graphics timing is not in the plan yet (OQ-9). Times are Eastern (OQ-6).

**Not in the plan:** LinkedIn. The platform exists in the app but has no slots (OQ-10).

## 2. Algorithm

**Inputs:** `day1_date` (a local date), `settings.timezone`, and the template slots.

For each slot:
```
local_date   = day1_date + (day_number − 1) days
local_time   = slot.local_time
scheduled_at = zonedTimeToUtc(local_date + local_time, timezone)   // date-fns-tz
```

- **DST:** if the local time doesn't exist (spring-forward gap), shift it forward to the first valid minute. If it's ambiguous (fall-back), use the first occurrence. Unit-test both cases.
- **Windows:** `window_end` is kept for display and for "best time" hints; `scheduled_at` uses the window start.
- **Best time:** `use_best_time` is passed to n8n. If Metricool best-time isn't available through the workflow (OQ-4), the default time is used.
- **Implementation:** `schedule.ts` is a pure function, `buildSchedule(template, day1Date, tz) → Slot[]`, shared by the UI (preview) and `schedule_project` (persist).

## 3. Day 1 suggestion
The next date on or after `today + settings.min_lead_days` whose weekday equals `template.day1_weekday`. The owner can pick any date; if it isn't a Tuesday, show a warning (weekday names in the template would no longer match).

## 4. Rules
1. **Linking.** One `scheduled_posts` row per slot, linked to the content item generated for the same (asset_role, platform, occurrence).
2. **Dispatch timing.** Approved posts are dispatched immediately (Metricool holds the timing). Unapproved posts wait (`waiting_approval`).
3. **Approval cutoff.** At `scheduled_at − publish_approval_cutoff_hours`, the owner gets a reminder if the post is still unapproved. After `scheduled_at`, it becomes `failed` with the reason `missed_not_approved`. It is never auto-posted late.
4. **Edits after dispatch.** A new time or edited content → the item goes back to `draft` → re-approval → `update` sent. Removing a post → `cancel` sent.
5. **Clashes.** Two posts (from any projects) on the same platform within `clash_window_hours` show a warning on both. This is common, since 15-day cycles overlap when topics start weekly (OQ-7b).
6. **Rebuilding.** Changing Day 1 rebuilds every post that isn't `sent`, `scheduled` or `published`. Those three need an explicit confirmation, which sends updates.
7. **Blog dependency.** The blog post is held until the long video is `published` and `{{youtube_embed}}` has been resolved. If the YouTube URL isn't back by the blog's slot, it is shifted within its Day 2–4 window; after Day 4 the owner is notified.

## 5. Platform rules (default `settings.platform_rules`)

These are starting values; confirm them against each platform's current limits before launch.

| Platform key | Caption max | Hashtags max | Visible before "more" | Link in caption |
|---|---|---|---|---|
| `youtube` | title 100 / description 5,000 | 15 | 157 (description) | yes |
| `youtube_shorts` | title 100 | 3 | — | no |
| `instagram_reels` / `instagram_feed` | 2,200 | 30 | 125 | no (link in bio) |
| `tiktok` | 2,200 | 8 (recommended) | 100 | no |
| `facebook` | 5,000 (practical) | 5 | 125 | yes |
| `x` | 280 | 3 | — | yes (counts as 23) |
| `threads` | 500 | 1 topic tag | — | yes |
| `pinterest` | title 100 / description 500 | 10 | — | yes (destination link) |
| `linkedin` | 3,000 | 5 | 210 | yes |
