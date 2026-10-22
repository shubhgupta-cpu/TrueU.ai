# Open questions

Until each item is answered, the app uses the default shown. Code that depends on an answer is marked `// TODO(OQ-n)`. When one is answered, record the answer here, update the affected docs, and remove the TODOs.

| # | Question | Default used until answered | Who |
|---|---|---|---|
| OQ-1 | In the schedule, are Days 2–5 posts **Short 1**, or clips from the long video? | Short 1 | Client |
| OQ-2 | Dropbox app type: full Dropbox, or an app folder? Whose Dropbox account? | Full Dropbox, root `/TrueU` | Client / Dev |
| OQ-3 | How does the current n8n flow give media to Metricool? Can it fetch a Dropbox `dl=1` shared link, or should we copy files to Supabase Storage? | Dropbox shared link with `dl=1` | Dev |
| OQ-3a | Is Short 2 meant to post on Instagram Reels **twice** (Day 10 and Day 14)? | Yes, 2 separate items with different captions | Client |
| OQ-3b | "Instagram Feed" (Day 6 Short 3, Day 12 Short 2): the short as a video post, or a Bannerbear graphic? | The short (video) | Client |
| OQ-4 | Can the n8n workflow use Metricool "best time", return the Metricool post ID, and report `published` with a URL? | Default times; `published` is reported when available | Dev |
| OQ-5 | Blog (WordPress) and newsletter (ActiveCampaign): published through n8n, or directly by the app? | Through n8n | Dev |
| OQ-6 | ~~Which timezone are the schedule times in?~~ **Answered 2026-10-22:** Eastern (calendar image footer); `settings.timezone = America/New_York`. | — | Client |
| OQ-7 | Rescore saved topics every month? | No, show the score date | Client |
| OQ-7b | Topic cycles: does a new topic start every Tuesday (cycles overlap) or every other Tuesday? | Every Tuesday, with clash warnings | Client |
| OQ-8 | ~~When is the newsletter sent?~~ **Answered 2026-10-22:** Day 8, 10:00 ET (calendar image). | — | Client |
| OQ-9 | Which graphics per topic (templates and count), which platforms, and when are they posted? | Render the `settings.graphics_set`; no automatic posting slots | Client |
| OQ-10 | LinkedIn isn't in the posting plan. Include it? | Not scheduled (platform available) | Client |
| OQ-11 | A weekly digest email to the owner? | Off | Client |
| OQ-12 | Should blog and newsletter approval also go by email, or in the app only? | In the app only | Client |
| OQ-13 | Public holidays to skip in SLA business-day counting? | Weekends only | Client |
| OQ-14 | Who is the editor (name and email)? Does the editor need a login? | Email only, no login | Client |
| OQ-15 | ~~The 6 scoring criteria names and their max points.~~ **Answered 2026-10-13** by the client's scoring prompt (v2.0): Search Intent Alignment, Personal Consequence, Fear + Curiosity Hook, Specific Person Targeting, Urgency / Timing, Platform Invitation — 10 points each, 60 total, pass mark 45. See `docs/prompts.md` §2.1. | — | Client |
