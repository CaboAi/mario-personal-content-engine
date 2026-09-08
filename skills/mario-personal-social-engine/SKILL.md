---
name: mario-personal-social-engine
description: Create, adapt, review, and iterate Instagram-first personal-brand content for Mario Polanco and @mario_polancojr. Use when Mario asks to turn a lived observation or story into content, generate hooks or scripts, build a content batch, adapt a saved-post format, create Yap Reels, Mini Stories, POV/Realization Reels, carousels, written posts, or long-form content, prepare Notion-ready production records, or analyze performance winners and decide the next test.
---

# Mario personal social engine

## Load context

Locate the repository root containing `brand-knowledge/` and `notion/`. Read these files in order before generating content:

1. `brand-knowledge/00_SOURCE_OF_TRUTH.md`
2. `brand-knowledge/02_BRAND_IDENTITY_AND_VOICE.md`
3. `brand-knowledge/04_HOOK_PATTERN_LIBRARY.md`
4. `brand-knowledge/05_STORY_BANK.md`
5. `brand-knowledge/06_LEARNINGS_LEDGER.md`

Read `brand-knowledge/03_PLATFORM_PLAYBOOK.md` when adapting to a platform. Read `notion/SCHEMA.md` and `notion/WORKFLOW.md` before creating or changing Notion records.

Fail loudly if the source of truth or voice file is missing. Do not silently replace them with generic advice.

## Establish the source

Start from exactly one of:

- A story Mario provides in the request.
- A verified Story Bank entry.
- A developed Daily Entries & Content record containing both Core Truth and Story or Evidence.
- An existing Content Production item being revised.

Do not use a saved creator's topic as the source. When a save is provided, extract delivery DNA only: hook syntax, pacing, slide structure, edit rhythm, visual treatment, or CTA placement.

When working from the Instagram Saves staging database, read `references/saved-post-workflow.md` and follow its approval states exactly.

If the story lacks a concrete moment or contains unverified claims, mark the missing facts and create an interview prompt instead of inventing them.

## Parse the request

Determine:

- Workflow mode: Idea, Skeleton, Full Script, Coach, Performance Review, or Batch. Default Skeleton.
- Content mode: Dispatch, Practical, or Reflection.
- Format: Yap Reel, Mini Story, POV / Realization, Carousel, Written Post, or Long-form.
- Primary goal: Reach, Shares, Saves, Follows, or Trust.
- Primary pillar and optional secondary pillar.
- Platform: Instagram by default; optional TikTok, YouTube Shorts, or Threads adaptations.
- Test variable: Hook, Topic, Length, Format, CTA, Visual, or None.

Infer reasonable values from context and label them. Ask only when missing information would force an invented personal fact or materially change the story.

## Build hooks before the body

For every new content item:

1. Write 3-5 spoken hooks.
2. Write 2-3 on-screen hooks.
3. Identify the strongest option and explain the choice in one sentence.
4. Keep the body stable when Hook is the selected test variable.

Hooks must point honestly to the body. Prefer confession, contradiction, lived receipt, or emotional precision over vague promises.

## Choose one test

Select exactly one test variable. Write a falsifiable hypothesis in this form:

> If [specific change], then [primary metric] should improve because [audience behavior].

Use `None` for a control or when the item is not part of a deliberate comparison. Do not claim a winner from an uncontrolled single post.

## Generate by workflow mode

### Idea

Output the source, core truth, earned opinion, recommended format, goal, pillar, hooks, test variable, and hypothesis. Do not write the full body.

### Skeleton (default)

Write talking prompts, not polished sentences:

- Opening receipt or tension.
- What happened.
- What Mario thought or felt then.
- What changed.
- The aggressive or clear opinion the story earns.
- Closing line.

End with: `Hit record and riff on this. If it sounds polished, restart.`

### Full Script

Write only when explicitly requested. Use short, speakable sentences. Preserve natural roughness. List any line that risks sounding generic or over-written.

### Coach

Give a concise verdict: what works, the weakest element, and one concrete revision. Do not rewrite the entire piece unless asked.

### Performance Review

Compare posts at the same review window when possible. Identify outliers by the stated goal, separate observations from explanations, and recommend one next test. Update a durable learning only after a repeated pattern or a controlled comparison.

### Batch

Keep daily posting as the floor and provide optional secondary inventory for twice-daily posting. Balance formats without forcing quotas. Do not reuse the same story merely to fill inventory.

For any batch of three or more, Reflection may not exceed one-third of the items. Report actual and target shares: Dispatch 60%, Practical 25%, Reflection 15%.

## Format behavior

Read `references/content-contract.md` for the exact package and format-specific structure.

Content-mode rules:

- Dispatch: concrete situation or real number, what Mario did, what actually happened, what he is changing, and what happens next. End on a result or decision that implies the next dispatch.
- Practical: hook, a plainly stated keepable list, question set, threshold, or rule, how to use it, and the cost of ignoring it. End on the rule, stated flat.
- Reflection: scene, what Mario believed then, what he did, what changed, and a dated claim. End on a claim, never a feeling or uncertainty.

Legal mode-format pairs:

- Dispatch: Yap Reel, POV / Realization, Carousel, Written Post, Long-form.
- Practical: Yap Reel, Carousel, Written Post, Long-form.
- Reflection: Yap Reel, Mini Story, POV / Realization, Written Post, Long-form.

Mini Story is Reflection-only, Carousel is excluded from Reflection, and POV / Realization is excluded from Practical. Video formats target 30-45 seconds.

## Quality gate

Reject or rewrite content that fails any mandatory check:

- The source is real and traceable.
- Mario appears early through a receipt, observation, or opinion.
- The post contains one primary idea.
- The language is direct and speakable.
- The ending is stronger than a generic CTA.
- The closing line lands a result, decision, or dated claim—not a principle, realization, takeaway, rhetorical question, or hedge.
- No story, metric, emotion, result, or biography was invented.
- A generic self-improvement account could not publish it unchanged.
- A saved post supplied structure only, never substance.

## Notion handoff

When the user asks to save content, use the existing Content Production data source defined in `notion/SCHEMA.md`. Populate every relevant generation property and place the complete creative package in the page body.

Do not overwrite performance metrics or production statuses during a creative revision. Do not create a duplicate production record when revising an existing item.

For an approved saved-post adaptation, link the finished Content Production item back to the save and mark the save `Used`. A save at `Needs Review` is not authorization to create a production item.

## End every batch

Output:

- Formats and pillars covered.
- Primary goal distribution.
- Test variable used for each item.
- Stories consumed and stories remaining.
- Missing facts or privacy confirmations.
- Recommended opening format for the next batch.
