# Optional raw Instagram Saves staging database

Create this database only when automatic saved-post ingestion is enabled. Use a new personal-brand Notion integration and token. Do not reuse another brand's integration.

Exact properties:

| Property | Type | Options or purpose |
|---|---|---|
| Name | Title | `@author/shortcode` |
| URL | URL | Original Instagram URL |
| Type | Select | Post, Reel, Carousel, IGTV |
| Author | Text | Username without `@` |
| Status | Select | New, Needs Review, Approved, Used, Ignored, Blocked |
| Media ID | Text | Dedupe key |
| Saved | Date | Sync timestamp |
| Caption | Text | Truncated to 1900 characters |
| Duration Sec | Number | Reel duration when supplied by Instagram |
| Framework DNA | Text | Observable sequence and delivery structure |
| Hook Mechanics | Text | Syntax, first-frame behavior, and tension pattern |
| Visual & Pacing | Text | Framing, captions, cuts, speed, and CTA placement |
| Adaptation Direction | Text | Mario-owned pairings and explicit non-transfer rules |
| Review Notes | Text | Approval, missing facts, or privacy constraints |
| Mario Source | Relation | Approved Daily Entry source |
| Production Item | Relation | Finished Content Production record |

`Collection` is intentionally omitted. The source engine's collections endpoint consistently returns non-JSON and adds noise without changing whether All Posts can sync.

The staging database is not an idea source. Reviewing a row may produce a Hook Swipe File entry describing delivery structure. It must not create a topic by reframing the saved caption.

Workflow: `New → Needs Review → Approved → Used`. `Ignored` is a deliberate skip. `Blocked` means the post could not be inspected or the proposed Mario source still needs facts/privacy approval.

## Current Instagram source

- Account: `@mario_polancojr`
- Target collection ID: `883342611266604`
- Endpoint pattern: `/api/v1/feed/collection/{collection_id}/posts/`

The collection ID is safe to keep in configuration. Instagram session cookies are not and must remain only in ignored `runtime/config.json`.

## Live Notion destination

- Database page ID: `21662d814c6645f8a36698276ad1963b`
- Data source ID used by the current Create Page API: `c40405c6-c4c4-4557-b1ef-16ffff0f5679`
- Database: [Mario Personal Instagram Saves](https://app.notion.com/p/21662d814c6645f8a36698276ad1963b)

The runtime must use the data source ID as `notion_saves_data_source_id`. The database page ID is useful for opening or sharing the database, but it is not the parent ID for new rows under the current Notion API.
