import unittest
import sys
from types import SimpleNamespace
from unittest import mock

if "requests" not in sys.modules:
    sys.modules["requests"] = SimpleNamespace(
        Session=object, post=None, get=None, HTTPError=Exception, RequestException=Exception, Response=object,
    )

from runtime.sync import (
    CollectionFeedUnavailable,
    classify_instagram_html,
    configured_collections,
    dashboard_payload,
    fetch_collection_posts,
    merge_collection_post,
    validate_session,
)


class FakeHttpError(Exception):
    def __init__(self, status_code):
        self.response = SimpleNamespace(status_code=status_code)


class FakeSession:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append(url)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeResponse:
    def __init__(self, *, status_code=200, url="https://www.instagram.com/api/v1/accounts/edit/web_form_data/", text="{}", content_type="application/json"):
        self.status_code = status_code
        self.url = url
        self.text = text
        self.headers = {"content-type": content_type}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise FakeHttpError(self.status_code)


class SessionCheckStub:
    def __init__(self, response):
        self.response = response
        self.headers = {}

    def get(self, *args, **kwargs):
        return self.response


class CollectionSyncTests(unittest.TestCase):
    def test_legacy_single_collection_is_a_reference_collection(self):
        self.assertEqual(configured_collections({"ig_collection_id": "legacy"}), [{"id": "legacy", "label": "Saved", "purpose": "reference"}])

    def test_duplicate_post_merges_collections_and_recreate_wins(self):
        posts = {}
        post = {"media_id": "1", "code": "abc", "author": "creator", "url": "https://www.instagram.com/p/abc/", "content_type": "Post", "caption": "", "duration_sec": 0}
        merge_collection_post(posts, post, {"id": "reference", "label": "Frameworks", "purpose": "reference"})
        merge_collection_post(posts, post, {"id": "recreate", "label": "Recreate", "purpose": "recreate"})
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts["1"]["collection_purpose"], "recreate")
        self.assertEqual(dashboard_payload(posts["1"])["collections"], [{"id": "reference", "label": "Frameworks", "purpose": "reference"}, {"id": "recreate", "label": "Recreate", "purpose": "recreate"}])

    def test_html_collection_feed_falls_back_to_all_saved_posts(self):
        session = FakeSession([])
        all_posts = [{"media_id": "one", "saved_collection_ids": ["frameworks"]}]
        calls = []

        def fetcher(_, collection_id=None):
            calls.append(collection_id)
            if collection_id:
                raise CollectionFeedUnavailable("text/html")
            return all_posts

        with mock.patch("runtime.sync._fetch_saved_posts", side_effect=fetcher):
            posts = fetch_collection_posts(session, "frameworks", "Frameworks", {})
        self.assertEqual(posts, all_posts)
        self.assertEqual(calls, ["frameworks", None])

    def test_404_collection_feed_still_falls_back(self):
        session = FakeSession([])
        all_posts = [{"media_id": "one", "saved_collection_ids": ["frameworks"]}]
        with mock.patch("runtime.sync._fetch_saved_posts", side_effect=[FakeHttpError(404), all_posts]):
            self.assertEqual(fetch_collection_posts(session, "frameworks", "Frameworks", {}), all_posts)

    def test_two_collections_reuse_one_all_saved_posts_fetch(self):
        session = FakeSession([])
        all_posts = [
            {"media_id": "one", "saved_collection_ids": ["frameworks"]},
            {"media_id": "two", "saved_collection_ids": ["recreate"]},
        ]
        cache = {}
        with mock.patch("runtime.sync._fetch_saved_posts", side_effect=[CollectionFeedUnavailable("html"), all_posts, CollectionFeedUnavailable("html")]) as fetch:
            fetch_collection_posts(session, "frameworks", "Frameworks", cache)
            fetch_collection_posts(session, "recreate", "Recreate", cache)
        self.assertEqual(fetch.call_count, 3)
        self.assertEqual([call.args[1] for call in fetch.call_args_list], ["frameworks", None, "recreate"])

    def test_zero_fallback_posts_warns_with_collection_label_and_id(self):
        session = FakeSession([])
        with mock.patch("runtime.sync._fetch_saved_posts", side_effect=[CollectionFeedUnavailable("html"), []]):
            with self.assertLogs("runtime.sync", level="WARNING") as logs:
                self.assertEqual(fetch_collection_posts(session, "frameworks", "Frameworks", {}), [])
        self.assertIn("Frameworks (frameworks) produced zero posts", "\n".join(logs.output))

    def test_html_classifier_distinguishes_auth_walls_from_the_app_shell(self):
        self.assertEqual(classify_instagram_html('<form name="loginForm"><input name="username">', "https://www.instagram.com/accounts/login/"), "login page")
        self.assertEqual(classify_instagram_html("challenge_required", "https://www.instagram.com/challenge/"), "challenge/checkpoint page")
        self.assertEqual(classify_instagram_html("<html><body>Instagram</body></html>", "https://www.instagram.com/api/v1/feed/saved/posts/"), "generic app shell")

    def test_302_to_login_final_response_fails_the_session_check(self):
        response = FakeResponse(
            url="https://www.instagram.com/accounts/login/?next=/api/v1/accounts/edit/web_form_data/",
            text="<!DOCTYPE html><html><body>Login</body></html>",
            content_type="text/html; charset=utf-8",
        )
        with self.assertRaisesRegex(
            RuntimeError,
            "Instagram session expired or rejected. Refresh the sessionid and csrftoken cookies in runtime/config.json.",
        ):
            validate_session(SessionCheckStub(response))


if __name__ == "__main__":
    unittest.main()
