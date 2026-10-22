# Prompts

The client's prompt text is stored in the Airtable `Prompts` table (versioned; one active version per key). The code never contains the client's wording. It contains only:
1. the variable values it passes in, and
2. the **output contract** it appends, meaning the JSON shape the response must have.

## 1. Rendering
- **Variables:** `{{variable}}` placeholders are replaced with values (objects and arrays are rendered as pretty JSON). A missing variable is an error in "Test run" and a job failure in production.
- **Unsupported placeholders:** any other `{{ … }}` left in the text (e.g. n8n's `{{ $json['All Topics'] }}` or `{{ $now }}`) is an error too. The Prompt manager flags them while editing. Replace them with the app's variables listed in §2.
- **Current date:** prompts that need today's date get `{{current_date}}` (`YYYY-MM-DD` in `settings.timezone`).
- **Brand context:** `{{brand_context}}` is always available (from `settings.brand_context`).
- **Output contract** appended to the end of every prompt:
  ```
  Return ONLY valid JSON matching this schema. No prose, no code fences.
  <JSON Schema generated from the zod schema>
  ```
- **Validation:** the response is parsed and validated with zod. On failure, retry once, adding: "Your previous output failed validation: <errors>. Return corrected JSON only." Then fail.
- **Soft checks:** format rules that don't affect the data (e.g. every improvement ends with "+X pts", exactly 3 search phrases) are stored as `topic_scores.warnings` and shown next to the score instead of failing the job.
- **Model:** `prompts.model`, else `settings.models.fast` for `trend_to_topic` and `quick_rewrite`, else `settings.models.default`. `prompts.temperature` is not sent: current Claude models reject sampling parameters. Models that support it get the server-side refusal fallback (`fallbacks: "default"`).
- **Mock mode:** with `MOCK_EXTERNAL=true` the response comes from `server/fixtures/claude/<key>*.ts` (picked deterministically per input) and the `TODO:` guard in §4 is skipped, so the app works end to end before the client's prompts are pasted in.

## 2. Prompt keys

The client provides the ones marked **client**; we write the ones marked **ours** and the client can edit them.

| Key | Owner | Variables | Output (zod) |
|---|---|---|---|
| `topic_generate` | client | `brand_context`, `count`, `recent_titles[]`, `saved_topics[]`, `performance_notes`, `current_date` | `{ topics: [{ title, description, category, angle }] }` |
| `trend_to_topic` | ours | `brand_context`, `keyword`, `trend_items[]` `{engine, query, value?, url?}`, `current_date` | `{ topics: [{ title, description, category, angle, trend_reason }] }` (0–3) |
| `topic_score` | client | `brand_context`, `topic` (title + description as text), `topic_json` `{title,description,category,source,source_detail}`, `current_date` | The client's evaluation JSON, see §2.1 |
| `topic_regenerate` | client | as `topic_score` + `prior_improvements` (bullet list of the last score's `top_improvements` and per-criterion improvements) | §2.1 plus `original_topic`, `regeneration_notes`; `topic` is the rewritten title (3–200 chars) |
| `script_generate` | client | `topic`, `episode_title`, `shared_value`, `notes` (also available: `brand_context`, `score_reasoning`, `current_date`) | see §3 |
| `script_regenerate` | client | `brand_context`, `current_script`, `scope` ("full" or "scene:<n>"), `notes` | full: same as §3; scene: `{ scene: {…one scene…} }` |
| `blog_generate` | client | `topic_title`, `decision_domain`, `script_summary`, `primary_keyword`, `secondary_keywords`, `search_intent`, `notes` (see §2.3) | `{ title, slug, meta_description (≤160), body_markdown (contains "{{youtube_embed}}"), key_takeaways[], internal_link_suggestions[] }` |
| `newsletter_generate` | client / ours | `brand_context`, `approved_script`, `blog_title` | `{ subject (≤60), preview_text (≤110), body_markdown }` |
| `youtube_metadata_generate` | client (see §2.5) | `brand_context`, `approved_script`, `platform_rules.youtube` | `{ title, description, tags[], chapters: [{ time, label }] }` |
| `captions_generate` | client (see §2.4) | `brand_context`, `approved_script`, `asset {role, clip_label, clip_summary}`, `slots: [{ platform, occurrence, day_number }]`, `platform_rules`, `cta_options` | `{ items: [{ platform, occurrence, caption, hashtags[], cta_type, extra? }] }` — one per slot |
| `graphics_copy_generate` | ours | `brand_context`, `approved_script`, `templates: [{ uid, name, content_type, layers: [{ name, field, max_chars }] }]` | `{ graphics: [{ template_uid, layers: { [layer_name]: string } }] }` |
| `quick_rewrite` | ours | `text`, `instruction` ("shorter", "more personal", "stronger hook", "fit N chars"), `platform_rules?` | `{ text }` |

### 2.1 Topic evaluation (`topic_score`, `topic_regenerate`)
The client's own output format (TrueU Topic Validation v2.0 / v2.1). Zod schema: `supabase/functions/_shared/schemas/topics.ts`.

```
{ evaluation: {
    topic, criteria_scores: {
      search_intent:        { score, reasoning, search_phrases[], improvements[] },
      personal_consequence: { score, reasoning, improvements[] },
      fear_curiosity:       { score, fear_identified, curiosity_gap, improvements[] },
      specific_person:      { score, person_description, improvements[] },
      urgency:              { score, reasoning, deadline_check, improvements[] },
      platform_invitation:  { score, reasoning, first_conversation_test, improvements[] } },
    total_score, score_breakdown: { <same six keys>: score },
    recommendation: "GREENLIGHT" | "REFINE" | "REJECT", trigger_moment,
    icp_alignment: "Strong" | "Moderate" | "Weak", icp_alignment_notes,
    top_improvements[], storyboard: { topic, episode_title, shared_value, side_a_cares_about,
    side_b_cares_about, shared_deeper_need }, summary } }
```

- **Hard rules (fail → retry once):** each criterion score is an integer 1–10; `total_score` equals the sum of the six; `score_breakdown` mirrors `criteria_scores`.
- **Soft rules (warnings):** 3 search phrases; every improvement ends with "+X pts"; the "+X pts" per criterion don't exceed the gap to 10; storyboard filled only at ≥ the pass mark; `shared_value` is one word; no ages in `person_description`.
- **Storage:** `topic_scores.evaluation` keeps the whole object; `criteria` holds the six rows normalised to `{key, label, score, max: 10, reasoning, improvements[], details}` for the score bars; `reasoning` = `summary`; `improvement_suggestions` = `top_improvements`.
- **Pass/fail:** the app's `qualified` / `needs_work` status uses `settings.score_threshold` (default 45). The prompt's `recommendation` is shown alongside; for 45–49 it says "REFINE" while the status is "Qualified".
- **Automatic regeneration:** when a topic scores below the threshold, `auto_regenerate_topics` is on (default), the topic isn't itself a regeneration, and the score has improvements, the `regenerate_topic` job runs `topic_regenerate` once. The rewritten topic is inserted as a new topic with `regenerated_from` = the original, scored by that same response. A topic is regenerated at most once (unique index).
### 2.3 Blog (`blog_generate`)
The client's **TrueU.ai Blog Post Generator v1.0** (Airtable `Prompts`, `blog_generate` v2, Max Tokens 16000). The app added an `<input>` block at the end with the variables the prompt names (they used to come from the MASTER_VIDEOS table):

| Variable | Filled from |
|---|---|
| `topic_title` | the topic title |
| `decision_domain` | the topic category, else the script's shared value |
| `script_summary` | the approved script: episode, topic, shared value, opening examples, scenes 1–6 narration, closing reflection (no production notes) |
| `primary_keyword` | the first search phrase in the topic score (`criteria_scores.search_intent.search_phrases[0]`), else the topic title |
| `secondary_keywords` | the other search phrases + the script's YouTube tags |
| `search_intent` | the score's search-intent reasoning |
| `notes` | regeneration notes (empty for v1) |

- **Shape (zod: `server/schemas/blog.ts`):** `title`, `meta_description`, `slug`, `primary_keyword`, `word_count`, `content {introduction, sections[2–6] {h2, content}, trueu_section {h2, content, cta_text}, conclusion, cta_box {headline, body, button_text, button_url}}`, `seo {internal_links[], external_links[], featured_image_suggestion}`, `brand_checklist`. The `Category: …` line the prompt puts above the JSON is read too (or a `category` field).
- **Warnings (the prompt's validation checklist):** title 50–60 characters with the primary keyword; meta description 150–160 with the keyword; 1,500–2,000 words (counted by the app); 3–5 sections; no TrueU.ai in the introduction; TrueU.ai 2–3 times, spelled exactly; "Thinking Partner" present; evolution message exactly once; forbidden terms (assistant, tool, chatbot, advisor, coach — flagged for a context check); hype words; "you should"; a category chosen.
- **Storage:** `Blog Versions.Blog JSON` keeps the whole output; `Title`, `Slug`, `Meta Description`, `Category`, `Primary Keyword`, `Word Count` and `Body Markdown` are copies for reading in Airtable.

### 2.4 Social captions (`captions_generate`)
The client's **TrueU Social Media Content Generator v2.4-agent** (Airtable `Prompts`, `captions_generate` v2, Max Tokens 32000). The app added a `<content_brief>` block with `{{content_title}}`, `{{content_type}}`, `{{topic_name}}`, `{{decision_domain}}`, `{{key_message}}`, `{{content_url}}`, `{{weekly_hashtags}}`, `{{notes}}` and `{{focus}}` (set when only one platform is regenerated; the full JSON is still returned and only that platform is kept).
- **Shape (zod: `server/schemas/captions.ts`):** the ten top-level keys of the prompt; every post has `hashtags` (a hashtag array is joined with spaces) and `caption` (Pinterest: `description`) plus its platform's graphic fields. Character counts are computed by the app; the model's `*_chars` fields are ignored.
- **Warnings per post:** the prompt's `<limit_checks>`, `<hashtag_checks>` and em-dash rule (see spec F10.0). A post with warnings is stored as `needs_edit`.

### 2.5 YouTube metadata (`youtube_metadata_generate`)
The client's **YouTube SEO Metadata Generator v2.0** (Airtable `Prompts`, v2, Max Tokens 16000), run once per video. The app added a `<video_input>` block: `{{topic_title}}`, `{{decision_domain}}`, `{{video_duration}}`, `{{script_summary}}`, `{{key_timestamps}}`, `{{primary_keyword}}`, `{{secondary_keywords}}`, `{{language}}`, `{{video_id}}`, `{{related_video_urls}}`, `{{notes}}` (see spec F10.0b for where each comes from). The prompt text itself was stored exactly as sent (it has one unclosed `<url>` tag).
- **Shape (zod: `server/schemas/youtube.ts`):** `titles {recommended, options[]}`, `description {full_text, …}`, `tags[]` (≥ 5), `thumbnail_text_options[] {headline, subtext?}`, optional `seo_notes`, `brand_checklist`.

### 2.6 CTAs & hooks (`cta_generate`) and 2.7 Polls (`poll_generate`)
- **`cta_generate`:** the client's CTA and Hook Generation Agent v3.7 (a JSON-format prompt), stored as sent plus an `INPUT:` block with `{{video_id}}`, `{{video_title}}`, `{{category}}`, `{{key_points}}`, `{{icp_segment}}`, `{{lead_magnet}}`, `{{blog_url}}`, `{{notes}}`. Shape: `server/schemas/extras.ts` (`ctas` with the 7 groups, optional `lead_magnet_match`).
- **`poll_generate`:** the client's Poll Question Generator v1.0. Its own `{{video_title}}`, `{{topic}}`, `{{script_summary}}`, `{{key_themes}}` are filled by the app; a revision-notes line was added. Shape: `{ polls: [5 × {poll_number, question, category, expected_split, why_engaging, platform_note}] }`.
- See spec F10.0c / F10.0d for inputs and checks.

## 3. Script output (`script_generate`)
The client's **Storyboard Creation Prompt v2.0** (Airtable `Prompts`, `script_generate` v2). Its own text asks for `topic`, `episode_title` and `shared_value`; the app added an `<episode_input>` block at the end of the stored prompt with `{{topic}}`, `{{episode_title}}`, `{{shared_value}}` and `{{notes}}` (regeneration notes, empty for v1).

- **Inputs:** `episode_title` and `shared_value` come from the topic score's storyboard (filled for passing scores). Otherwise the topic title is used and Claude is asked to choose the shared value.
- **Shape (zod: `server/schemas/script.ts`):** `episode_metadata`, `opening_examples` (A, B, connecting statement), `long_form_storyboard` (scenes 1–6 with narration, on-screen text, B-roll, background, camera, music, beat; `scene_7_cta`; `scene_8_outro`), `narrator_backgrounds[]`, `short_form_clips` (exactly 6), `youtube_optimization` (title, description, tags, hashtags, thumbnail), `closing_reflection`, `clip_timestamps` (exactly 3: these label Short 1–3), `transition_notes`.
- **Hard rules (fail → retry once):** every section present with the types above; 6 short clips; 3 clip timestamps.
- **Soft rules (warnings, from the prompt's final self-check):** no em/en dashes; "TrueU.ai" spelled exactly; "Private Intelligence" in the Scene 7 CTA, every clip platform tease and the YouTube description; "thinking partner" or "private space" in the CTA; no forbidden privacy claims, promises, verdict framing, distress hooks or forbidden descriptors; scene narration 130–230 words (target 150–200); CTA ≤ 60 words; on-screen lines ≤ 60 characters; YouTube title ≤ 60 characters. Stored in `Script Versions.Warnings` and shown on the project page.
- **Storage:** `Script Versions.Script JSON` keeps the whole output; `Title` = episode title; `Scenes`, `Clips` (= clip timestamps), `Storyboard` (= narrator backgrounds) and `Body Markdown` are derived copies for reading in Airtable.
- **Size:** about 7–10k output tokens and 60–120 s with Sonnet; the prompt record sets Max Tokens 16000.

## 4. Seeding
- **Seed:** `npm run airtable:seed` inserts every key at version 1 with body `TODO: paste the client's prompt`, marked Active.
- **Before first use,** the admin pastes the real prompts in the Prompt manager, which creates version 2.
- **Guard:** jobs refuse to run a prompt whose active body still starts with `TODO:`, and fail with the error "Prompt <key> not configured".
