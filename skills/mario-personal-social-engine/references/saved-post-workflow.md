# Saved-post adaptation workflow

## Purpose

Turn a saved Instagram post into a Mario-owned creative direction without copying the creator's topic, claim, story, wording, or lesson.

## State machine

1. `New`: synced but not analyzed.
2. `Needs Review`: delivery DNA and Mario-source candidates are documented. Nothing enters production yet.
3. `Approved`: Mario approved one source/direction. The engine may create the complete content package.
4. `Used`: a linked Content Production record exists.
5. `Ignored`: intentionally skipped.
6. `Blocked`: the source cannot be inspected or the Mario material lacks required facts/privacy approval.

## Analyze a New save

1. Inspect the actual post. Caption-only analysis is insufficient for a Reel or visually structured Carousel.
2. Record only observable delivery mechanics:
   - Hook mechanics and first-frame behavior.
   - Argument or slide sequence.
   - Duration, pacing, cuts, captions, framing, and CTA placement.
   - What creates attention, tension, or retention.
3. Explicitly list what must not transfer: creator topic, wording, claims, identity, story, examples, and lesson.
4. Search in this order for Mario-owned substance:
   - Verified Story Bank entry.
   - Developed Daily Entries & Content record.
   - Existing Content Production item being revised or extended.
5. Offer no more than three pairings. Each pairing must name the source and explain why the delivery structure fits it.
6. If every pairing needs facts or privacy approval, record that constraint. Never invent the missing material.
7. Write the analysis into the save page and set `Status` to `Needs Review`.

## After approval

1. Confirm the selected Mario source and primary goal.
2. Generate 3-5 spoken hooks and 2-3 on-screen hooks.
3. Choose exactly one test variable and write a falsifiable hypothesis.
4. Build the requested Idea, Skeleton, or Full Script package using the standard content contract.
5. Create one Content Production record with the complete package in the page body.
6. Link the save's `Mario Source` and `Production Item` relations.
7. Mark the save `Used`.

## Failure rules

- Do not infer a Reel's framework from its caption alone.
- Do not use comments as proof of Mario's beliefs or experience.
- Do not call a loose thematic rewrite an adaptation. Name the structural element being transferred.
- Do not automatically publish, schedule, or mark a production item Ready to Record.
