# Notion contract

The existing Notion workspace is the operating layer. Do not create duplicate production databases.

## Content Operating System

- Page ID: `3b9714e2-15bf-814a-b455-eb399d29e559`
- Parent: The Becoming Journal.

## Content Production

- Database ID: `333de6fb-f979-4990-aab6-cb488a3196dc`
- Data source: `collection://5b5bb71f-cee2-44fa-93a7-cab6e39733d0`
- Purpose: one record from approved concept through performance review.

Required generation properties:

- `Content` (title)
- `Content Type` (select): Yap Reel, Mini Story, POV / Realization, Carousel, Written Post, Long-form
- `Pillar` (multi-select): Reinvention, Identity, Standards, Action, Responsibility, Self-Respect, Perspective, Life Story
- `Goal` (select): Reach, Shares, Saves, Follows, Trust
- `Hook` (text): selected spoken hook
- `Hook Variants` (text): 3-5 spoken options
- `On-Screen Hook` (text): selected title plus alternatives when space permits
- `Test Variable` (select): Hook, Topic, Length, Format, CTA, Visual, None
- `Hypothesis` (text)
- `CTA` (text)
- `Status` (select)
- `Platforms` (multi-select)
- `Batch` (text)

Production properties:

- `Status`: Script Ready, Ready to Record, Recorded, Edited, Scheduled, Posted
- `Recorded` (checkbox)
- `Posted` (checkbox)
- `Post Date` (date)
- `Length Sec` (number)
- `Sequence` (number)

Performance properties:

- `Views`
- `Viewers / Reach`
- `Avg Watch Sec`
- `Likes`
- `Comments`
- `Shares`
- `Reposts`
- `Saves`
- `Follows`
- `Winner`
- `Performance Notes`

The page body stores the full creative package and script. Do not add a duplicate long-text Script property unless an integration later requires it.

## Hook Swipe File

- Database ID: `9fba7f45-bc79-40fe-b589-bd606a43b167`
- Data source: `collection://97597dff-bd66-4b7b-852d-fed58428df48`
- Purpose: reusable attention patterns with a Mario adaptation.

The fields `Pattern`, `Why It Works`, and `Mario Adaptation` matter more than copying the original hook.

## Daily Entries & Content

- Database ID: `f25d9320-4125-4842-b398-097d6aa45b9f`
- Data source: `collection://d61366a8-d208-45e9-b6fa-cc9a6074c554`
- Purpose: raw idea and lived-story capture.

## Views

Production Board, Publishing Calendar, and Performance Lab are views of Content Production. They are not independent databases.

## Current data-quality gap

The existing records numbered 01-20 were created before the full schema was consistently applied. Many are missing Pillar, Goal, On-Screen Hook, Content Type, Test Variable, and Hypothesis. Backfill should preserve scripts and statuses while completing only verified fields.
