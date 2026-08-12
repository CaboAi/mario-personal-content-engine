#!/usr/bin/env python3
"""Sync Instagram saved posts to the dashboard and optional Notion mirror."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

try:
    from notion_client import Client as NotionClient
except ImportError:  # Tests can exercise parsing without the optional client.
    NotionClient = None


BASE_DIR = Path(__file__).parent.resolve()
CONFIG_FILE = BASE_DIR / "config.json"
STATE_FILE = BASE_DIR / "state.json"
LOG_FILE = BASE_DIR / "sync.log"

IG_BASE = "https://www.instagram.com/api/v1"
NOTION_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"
IG_APP_ID = "936619743392459"
IG_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

INSTAGRAM_REQUIRED_CONFIG = {
    "ig_session_id",
    "ig_csrftoken",
    "ig_user_id",
}

DASHBOARD_RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
DASHBOARD_MAX_ATTEMPTS = 3

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


def load_config(path: Path = CONFIG_FILE) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Copy config.example.json to config.json and add credentials."
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    missing = sorted(key for key in INSTAGRAM_REQUIRED_CONFIG if not data.get(key))
    if missing:
        raise ValueError(f"Missing configuration values: {', '.join(missing)}")

    notion_token = str(data.get("notion_token") or "").strip()
    notion_source_id = str(data.get("notion_saves_data_source_id") or "").strip()
    if bool(notion_token) != bool(notion_source_id):
        raise ValueError(
            "notion_token and notion_saves_data_source_id must either both be set "
            "or both be omitted."
        )

    dashboard_url = str(data.get("dashboard_ingest_url") or "").strip()
    dashboard_secret = str(data.get("dashboard_ingestion_secret") or "").strip()
    if bool(dashboard_url) != bool(dashboard_secret):
        raise ValueError(
            "dashboard_ingest_url and dashboard_ingestion_secret must either both be set "
            "or both be omitted."
        )
    if dashboard_url:
        is_local = dashboard_url.startswith(("http://127.0.0.1", "http://localhost"))
        if not dashboard_url.startswith("https://") and not is_local:
            raise ValueError("dashboard_ingest_url must use HTTPS outside local development.")
        if not dashboard_url.rstrip("/").endswith("/api/ingest"):
            raise ValueError("dashboard_ingest_url must end with /api/ingest.")
        if len(dashboard_secret) < 32 or dashboard_secret.startswith("REPLACE_"):
            raise ValueError("dashboard_ingestion_secret must be a random value of 32+ characters.")
    if not notion_token and not dashboard_url:
        raise ValueError(
            "Configure at least one destination: the dashboard pair or the Notion pair."
        )
    return data


def enabled_destinations(config: dict[str, str]) -> tuple[bool, bool]:
    """Return (notion_enabled, dashboard_enabled) after config validation."""
    notion_enabled = bool(
        str(config.get("notion_token") or "").strip()
        and str(config.get("notion_saves_data_source_id") or "").strip()
    )
    dashboard_enabled = bool(
        str(config.get("dashboard_ingest_url") or "").strip()
        and str(config.get("dashboard_ingestion_secret") or "").strip()
    )
    return notion_enabled, dashboard_enabled


def load_state(account_id: str, path: Path = STATE_FILE) -> dict[str, Any]:
    if not path.exists():
        return {
            "account_id": account_id,
            "synced_ids": [],
            "dashboard_synced_ids": [],
            "last_sync": None,
        }
    state = json.loads(path.read_text(encoding="utf-8"))
    stored_account = str(state.get("account_id") or "")
    if stored_account and stored_account != str(account_id):
        raise RuntimeError(
            "state.json belongs to a different Instagram account. "
            "Use a separate project or explicitly reset state."
        )
    state["account_id"] = str(account_id)
    state.setdefault("synced_ids", [])
    state.setdefault("dashboard_synced_ids", [])
    state.setdefault("last_sync", None)
    return state


def save_state(state: dict[str, Any], path: Path = STATE_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    temporary_path.replace(path)


def build_session(config: dict[str, str]) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "X-IG-App-ID": IG_APP_ID,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": IG_USER_AGENT,
            "Referer": "https://www.instagram.com/",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "X-CSRFToken": config["ig_csrftoken"],
            "X-ASBD-ID": "129477",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        }
    )
    session.cookies.set("sessionid", config["ig_session_id"], domain=".instagram.com")
    session.cookies.set("csrftoken", config["ig_csrftoken"], domain=".instagram.com")
    session.cookies.set("ds_user_id", config["ig_user_id"], domain=".instagram.com")
    return session


def validate_session(session: requests.Session) -> None:
    response = session.get(f"{IG_BASE}/accounts/edit/web_form_data/", timeout=15)
    if response.status_code == 401:
        raise RuntimeError("Instagram session expired. Refresh the cookies in config.json.")
    response.raise_for_status()
    claim = response.headers.get("x-ig-set-www-claim")
    if claim:
        session.headers["X-IG-WWW-Claim"] = claim
    log.info("Instagram session OK")


def parse_media(media: dict[str, Any]) -> dict[str, Any] | None:
    try:
        media_type = int(media.get("media_type", 1))
        product_type = str(media.get("product_type") or "")
        if media_type == 2 and product_type == "clips":
            content_type = "Reel"
        elif media_type == 8:
            content_type = "Carousel"
        elif media_type == 2:
            content_type = "IGTV"
        else:
            content_type = "Post"

        code = str(media.get("code") or "")
        url_type = "reel" if content_type == "Reel" else "p"
        url = f"https://www.instagram.com/{url_type}/{code}/" if code else ""

        caption_obj = media.get("caption")
        if isinstance(caption_obj, dict):
            caption = str(caption_obj.get("text") or "")
        elif caption_obj:
            caption = str(caption_obj)
        else:
            caption = ""

        user = media.get("user")
        author = str(user.get("username") or "") if isinstance(user, dict) else ""
        media_id = str(media.get("pk") or media.get("id") or "")
        if not media_id:
            return None

        return {
            "media_id": media_id,
            "code": code,
            "author": author,
            "caption": caption[:1900],
            "url": url,
            "content_type": content_type,
            "duration_sec": round(float(media.get("video_duration") or 0), 1),
            "saved_collection_ids": [
                str(value) for value in (media.get("saved_collection_ids") or [])
            ],
        }
    except (TypeError, ValueError):
        return None


def saved_posts_endpoint(collection_id: str | None = None) -> str:
    if collection_id:
        return f"{IG_BASE}/feed/collection/{collection_id}/posts/"
    return f"{IG_BASE}/feed/saved/posts/"


def fetch_saved_posts(
    session: requests.Session,
    collection_id: str | None = None,
) -> list[dict[str, Any]]:
    try:
        return _fetch_saved_posts(session, collection_id)
    except requests.HTTPError as exc:
        if (
            not collection_id
            or exc.response is None
            or exc.response.status_code != 404
        ):
            raise
        log.warning(
            "Instagram collection feed returned 404; filtering All Saved Posts for collection %s",
            collection_id,
        )
        return [
            post
            for post in _fetch_saved_posts(session, None)
            if collection_id in post.get("saved_collection_ids", [])
        ]


def _fetch_saved_posts(
    session: requests.Session,
    collection_id: str | None = None,
) -> list[dict[str, Any]]:
    posts: list[dict[str, Any]] = []
    seen: set[str] = set()
    max_id = ""
    page = 0

    while True:
        params = {"max_id": max_id} if max_id else None
        response = session.get(
            saved_posts_endpoint(collection_id),
            params=params,
            timeout=20,
        )
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError as exc:
            content_type = response.headers.get("content-type", "unknown")
            raise RuntimeError(
                f"Instagram returned non-JSON saved-post data ({content_type})."
            ) from exc

        for raw in data.get("items", []):
            media = raw.get("media", raw) if isinstance(raw, dict) else {}
            parsed = parse_media(media)
            if parsed and parsed["media_id"] not in seen:
                seen.add(parsed["media_id"])
                posts.append(parsed)

        page += 1
        log.info("Fetched saved-post page %s (%s unique posts)", page, len(posts))
        max_id = str(data.get("next_max_id") or "")
        if not data.get("more_available") or not max_id:
            break
        time.sleep(1.0)

    return posts


def fetch_collections(session: requests.Session) -> list[dict[str, str]]:
    response = session.get(
        f"{IG_BASE}/collections/list/",
        params={
            "collection_types": '["ALL_MEDIA_AUTO_COLLECTION","PRODUCT_AUTO_COLLECTION","MEDIA"]'
        },
        timeout=20,
    )
    response.raise_for_status()
    try:
        data = response.json()
    except ValueError as exc:
        content_type = response.headers.get("content-type", "unknown")
        raise RuntimeError(
            f"Instagram returned non-JSON collection data ({content_type})."
        ) from exc

    collections: list[dict[str, str]] = []
    for item in data.get("items", []):
        if not isinstance(item, dict):
            continue
        collections.append(
            {
                "id": str(item.get("collection_id") or ""),
                "name": str(item.get("collection_name") or "Saved"),
                "type": str(item.get("collection_type") or ""),
            }
        )
    return collections


def validate_notion_access(config: dict[str, str]) -> None:
    data_source_id = config["notion_saves_data_source_id"]
    response = requests.get(
        f"{NOTION_BASE}/data_sources/{data_source_id}",
        headers={
            "Authorization": f"Bearer {config['notion_token']}",
            "Notion-Version": NOTION_VERSION,
            "Accept": "application/json",
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("object") != "data_source" or payload.get("id") != data_source_id:
        raise RuntimeError("Notion returned an unexpected data source response.")
    log.info("Notion access OK: %s", payload.get("name") or "data source")


def notion_properties(post: dict[str, Any]) -> dict[str, Any]:
    name = f"@{post['author']}/{post['code']}" if post["code"] else f"@{post['author']}"
    properties = {
        "Name": {"title": [{"text": {"content": name[:2000]}}]},
        "URL": {"url": post["url"] or None},
        "Type": {"select": {"name": post["content_type"]}},
        "Author": {"rich_text": [{"text": {"content": post["author"]}}]},
        "Status": {"select": {"name": "New"}},
        "Media ID": {"rich_text": [{"text": {"content": post["media_id"]}}]},
        "Saved": {"date": {"start": datetime.now(timezone.utc).isoformat()}},
        "Caption": {"rich_text": [{"text": {"content": post["caption"]}}]},
    }
    duration = float(post.get("duration_sec") or 0)
    if duration > 0:
        properties["Duration Sec"] = {"number": duration}
    return properties


def sync_post(notion: Any, data_source_id: str, post: dict[str, Any]) -> None:
    notion.pages.create(
        parent={"type": "data_source_id", "data_source_id": data_source_id},
        properties=notion_properties(post),
    )


def dashboard_payload(post: dict[str, Any]) -> dict[str, Any]:
    return {
        "instagram_media_id": post["media_id"],
        "shortcode": post["code"],
        "author": post["author"],
        "url": post["url"],
        "content_type": post["content_type"],
        "caption": post["caption"],
        "duration_seconds": float(post.get("duration_sec") or 0) or None,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }


def _retry_delay(response: requests.Response, attempt: int) -> float:
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return min(max(float(retry_after), 0.0), 30.0)
        except ValueError:
            pass
    return float(2 ** (attempt - 1))


def sync_post_to_dashboard(
    config: dict[str, str],
    post: dict[str, Any],
    *,
    request_post: Any = requests.post,
    sleep: Any = time.sleep,
    max_attempts: int = DASHBOARD_MAX_ATTEMPTS,
) -> None:
    url = str(config.get("dashboard_ingest_url") or "").strip()
    secret = str(config.get("dashboard_ingestion_secret") or "").strip()
    if not url or not secret:
        return
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1.")

    payload = dashboard_payload(post)
    for attempt in range(1, max_attempts + 1):
        try:
            response = request_post(
                url,
                headers={"X-Ingestion-Secret": secret, "Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )
        except requests.RequestException:
            if attempt == max_attempts:
                raise
            log.warning(
                "Dashboard request failed before a response (attempt %s/%s); retrying",
                attempt,
                max_attempts,
            )
            sleep(float(2 ** (attempt - 1)))
            continue

        if response.ok:
            return
        if response.status_code not in DASHBOARD_RETRYABLE_STATUS_CODES or attempt == max_attempts:
            response.raise_for_status()
        delay = _retry_delay(response, attempt)
        log.warning(
            "Dashboard returned HTTP %s (attempt %s/%s); retrying in %.1fs",
            response.status_code,
            attempt,
            max_attempts,
            delay,
        )
        sleep(delay)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Instagram saves to the dashboard and optional Notion mirror"
    )
    parser.add_argument("--dry-run", action="store_true", help="Read Instagram without writing")
    parser.add_argument("--reset", action="store_true", help="Reset local dedupe state")
    parser.add_argument(
        "--all-saves",
        action="store_true",
        help="Ignore the configured collection and test the All Saved Posts feed",
    )
    parser.add_argument(
        "--list-collections",
        action="store_true",
        help="List collection names and IDs without syncing posts",
    )
    parser.add_argument(
        "--check-notion",
        action="store_true",
        help="Validate the Notion token and data-source access without writing",
    )
    args = parser.parse_args()

    try:
        config = load_config()
        notion_enabled, dashboard_enabled = enabled_destinations(config)
        if args.check_notion:
            if not notion_enabled:
                raise RuntimeError(
                    "Notion is not configured. Add both optional Notion settings to check it."
                )
            validate_notion_access(config)
            return 0
        state = load_state(config["ig_user_id"])
        if args.reset:
            state = {
                "account_id": config["ig_user_id"],
                "synced_ids": [],
                "dashboard_synced_ids": [],
                "last_sync": None,
            }

        session = build_session(config)
        validate_session(session)
        if args.list_collections:
            collections = fetch_collections(session)
            if not collections:
                log.info("No named collections returned")
            for collection in collections:
                log.info(
                    "Collection: %s | ID: %s | Type: %s",
                    collection["name"],
                    collection["id"],
                    collection["type"],
                )
            return 0
        collection_id = None
        if not args.all_saves:
            collection_id = str(config.get("ig_collection_id") or "").strip() or None
        if collection_id:
            log.info("Sync target: Instagram collection %s", collection_id)
        else:
            log.info("Sync target: all saved posts")
        posts = fetch_saved_posts(session, collection_id)
        synced_ids = set(state["synced_ids"])
        dashboard_synced_ids = set(state["dashboard_synced_ids"])
        notion_pending = (
            [post for post in posts if post["media_id"] not in synced_ids]
            if notion_enabled
            else []
        )
        dashboard_pending = (
            [post for post in posts if post["media_id"] not in dashboard_synced_ids]
            if dashboard_enabled
            else []
        )

        if args.dry_run:
            for post in notion_pending:
                log.info(
                    "[DRY RUN] Would sync @%s/%s to Notion",
                    post["author"],
                    post["code"],
                )
            for post in dashboard_pending:
                log.info(
                    "[DRY RUN] Would sync @%s/%s to dashboard",
                    post["author"],
                    post["code"],
                )
            log.info(
                "Dry run complete: %s Notion new | %s dashboard new | "
                "%s Notion existing | %s dashboard existing",
                len(notion_pending),
                len(dashboard_pending),
                len(posts) - len(notion_pending) if notion_enabled else 0,
                len(posts) - len(dashboard_pending) if dashboard_enabled else 0,
            )
            return 0

        if notion_pending and NotionClient is None:
            raise RuntimeError("notion-client is not installed. Install runtime/requirements.txt.")
        notion = NotionClient(auth=config["notion_token"]) if notion_pending else None

        errors = 0
        for post in notion_pending:
            try:
                sync_post(notion, config["notion_saves_data_source_id"], post)
                synced_ids.add(post["media_id"])
                state["synced_ids"] = sorted(synced_ids)
                save_state(state)
            except Exception as exc:  # Keep the remaining batch observable.
                errors += 1
                log.error("Notion write failed for %s: %s", post["media_id"], exc)
            time.sleep(0.35)

        dashboard_errors = 0
        for post in dashboard_pending:
            try:
                sync_post_to_dashboard(config, post)
                dashboard_synced_ids.add(post["media_id"])
                state["dashboard_synced_ids"] = sorted(dashboard_synced_ids)
                save_state(state)
            except Exception as exc:
                dashboard_errors += 1
                log.error("Dashboard write failed for %s: %s", post["media_id"], exc)
            time.sleep(0.2)

        state["synced_ids"] = sorted(synced_ids)
        state["dashboard_synced_ids"] = sorted(dashboard_synced_ids)
        state["last_sync"] = datetime.now(timezone.utc).isoformat()
        save_state(state)
        log.info(
            "Sync complete: %s Notion new | %s dashboard new | "
            "%s Notion existing | %s dashboard existing | %s errors",
            len(notion_pending) - errors,
            len(dashboard_pending) - dashboard_errors,
            len(posts) - len(notion_pending) if notion_enabled else 0,
            len(posts) - len(dashboard_pending) if dashboard_enabled else 0,
            errors + dashboard_errors,
        )
        return 1 if errors or dashboard_errors else 0
    except Exception as exc:
        log.error("Sync failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
