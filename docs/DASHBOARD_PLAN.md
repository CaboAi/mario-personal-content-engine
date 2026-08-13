# Mario Content Engine dashboard plan

## Product decision

Build one private dashboard for saved-post intake, brand-safe adaptation, approval, production, and analytics. Publishing automation is explicitly out of scope for the MVP.

Supabase becomes the application source of truth. Notion remains available as a transition mirror until the dashboard has proven reliable.

## MVP workflow

1. The existing local Python bridge reads Mario's Instagram saves.
2. The bridge sends normalized save metadata to the dashboard ingestion endpoint.
3. A background analysis job inspects delivery DNA and creates up to three Mario-owned pairings.
4. Mario reviews a saved post and selects one pairing in the dashboard.
5. One action generates the creative package and moves it into Production.
6. Mario moves the item through the workflow for its format: recording stages for Reels, Canva stages for Carousels, and writing stages for Written Post and Long-form.
7. The official Meta API later attaches analytics snapshots to posted content.

## MVP screens

- Command Center: queue health, inventory, next decisions, and system status.
- Saves Inbox: saved media, delivery DNA, forbidden transfer, pairings, approval.
- Production: content packages and production status.
- Performance: connected-account status and comparable metric snapshots.
- Brand System: source-of-truth rules, pillars, goals, and verified story inventory.

## Explicit exclusions

- Publishing or scheduling posts to Instagram.
- Multi-user teams or multi-brand workspaces.
- Automated winner formulas before baseline performance exists.
- Cloud storage of Instagram session cookies.
- Generating from a saved creator's topic or story.

## Delivery phases

### Phase 1 — application shell

- Private single-user access.
- Responsive dashboard and demonstration data.
- Supabase schema and server-side data client.
- Secure ingestion endpoint.
- OpenAI structured generation endpoint.

### Phase 2 — live data

- Create Supabase project tables from the migration.
- Add Vercel environment variables.
- Adapt the local Python bridge to dual-write to the dashboard.
- Import current Notion saves, stories, and production records.

### Phase 3 — analytics

- Connect Mario's professional Instagram account through Meta OAuth.
- Import owned media and available insights.
- Match Instagram media IDs to production items.
- Add consistent review windows and outlier comparisons.

## Acceptance criteria

- A new save can enter without exposing Instagram cookies to the cloud.
- A save cannot create content without a Mario-owned source.
- One dashboard action can approve a pairing, generate content, and create a production item.
- Every content item contains goal, pillar, hooks, test variable, and hypothesis.
- Secrets stay server-side and no credential is committed.
- The dashboard works on desktop and mobile and includes loading, empty, and error states.
