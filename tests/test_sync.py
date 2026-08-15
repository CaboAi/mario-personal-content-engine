import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests


MODULE_PATH = Path(__file__).parents[1] / "runtime" / "sync.py"
SPEC = importlib.util.spec_from_file_location("personal_sync", MODULE_PATH)
sync = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(sync)


class ParseMediaTests(unittest.TestCase):
    def test_collection_endpoint(self):
        self.assertEqual(
            sync.saved_posts_endpoint("883342611266604"),
            "https://www.instagram.com/api/v1/feed/collection/883342611266604/posts/",
        )

    def test_all_saved_endpoint_without_collection(self):
        self.assertEqual(
            sync.saved_posts_endpoint(),
            "https://www.instagram.com/api/v1/feed/saved/posts/",
        )

    def test_parses_reel(self):
        result = sync.parse_media(
            {
                "pk": "123",
                "media_type": 2,
                "product_type": "clips",
                "code": "ABC",
                "caption": {"text": "hello"},
                "user": {"username": "creator"},
                "video_duration": 37.04,
            }
        )
        self.assertEqual(result["content_type"], "Reel")
        self.assertEqual(result["url"], "https://www.instagram.com/reel/ABC/")
        self.assertEqual(result["duration_sec"], 37.0)

    def test_keeps_temporary_asset_descriptors_outside_dashboard_payload(self):
        result = sync.parse_media(
            {
                "pk": "123",
                "media_type": 2,
                "product_type": "clips",
                "code": "ABC",
                "video_versions": [
                    {"url": "https://scontent.example.fbcdn.net/save.mp4", "width": 720, "height": 1280}
                ],
            }
        )
        self.assertEqual(result["_analysis_assets"][0]["kind"], "video")
        self.assertNotIn("_analysis_assets", sync.dashboard_payload(result))

    def test_rejects_missing_media_id(self):
        self.assertIsNone(sync.parse_media({"code": "ABC"}))

    def test_caps_caption_length(self):
        result = sync.parse_media(
            {
                "pk": "123",
                "code": "ABC",
                "caption": {"text": "x" * 2500},
                "user": {"username": "creator"},
            }
        )
        self.assertEqual(len(result["caption"]), 1900)

    def test_parses_saved_collection_ids(self):
        result = sync.parse_media(
            {
                "pk": "123",
                "code": "ABC",
                "saved_collection_ids": [883342611266604],
            }
        )
        self.assertEqual(result["saved_collection_ids"], ["883342611266604"])

    def test_collection_404_falls_back_to_filtered_all_saved(self):
        collection_response = Mock()
        collection_response.status_code = 404
        collection_response.raise_for_status.side_effect = requests.HTTPError(
            response=collection_response
        )
        all_saved_response = Mock()
        all_saved_response.status_code = 200
        all_saved_response.raise_for_status.return_value = None
        all_saved_response.json.return_value = {
            "items": [
                {
                    "pk": "keep",
                    "code": "KEEP",
                    "saved_collection_ids": ["target"],
                },
                {
                    "pk": "skip",
                    "code": "SKIP",
                    "saved_collection_ids": ["other"],
                },
            ],
            "more_available": False,
        }
        session = Mock()
        session.get.side_effect = [collection_response, all_saved_response]

        posts = sync.fetch_saved_posts(session, "target")

        self.assertEqual([post["media_id"] for post in posts], ["keep"])
        self.assertEqual(
            session.get.call_args_list[1].args[0],
            "https://www.instagram.com/api/v1/feed/saved/posts/",
        )


class StateTests(unittest.TestCase):
    def test_rejects_state_from_another_account(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "state.json"
            path.write_text(
                json.dumps({"account_id": "old", "synced_ids": []}),
                encoding="utf-8",
            )
            with self.assertRaises(RuntimeError):
                sync.load_state("new", path)

    def test_adds_dashboard_state_for_legacy_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "state.json"
            path.write_text(
                json.dumps({"account_id": "same", "synced_ids": ["123"]}),
                encoding="utf-8",
            )
            state = sync.load_state("same", path)
            self.assertEqual(state["dashboard_synced_ids"], [])
            self.assertEqual(state["dashboard_analyzed_ids"], [])


    def test_save_state_replaces_file_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "state.json"
            sync.save_state({"account_id": "same", "synced_ids": ["123"]}, path)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["synced_ids"], ["123"])
            self.assertFalse(path.with_suffix(".json.tmp").exists())


class ConfigTests(unittest.TestCase):
    def base_config(self):
        return {
            "ig_session_id": "session",
            "ig_csrftoken": "csrf",
            "ig_user_id": "user",
            "notion_token": "notion",
            "notion_saves_data_source_id": "source",
        }

    def write_config(self, path, values):
        path.write_text(json.dumps(values), encoding="utf-8")

    def dashboard_config(self):
        return {
            "ig_session_id": "session",
            "ig_csrftoken": "csrf",
            "ig_user_id": "user",
            "dashboard_ingest_url": "https://example.vercel.app/api/ingest",
            "dashboard_ingestion_secret": "a" * 32,
        }

    def test_accepts_dashboard_without_notion(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            self.write_config(path, self.dashboard_config())
            config = sync.load_config(path)
            self.assertEqual(sync.enabled_destinations(config), (False, True))

    def test_accepts_notion_without_dashboard(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            self.write_config(path, self.base_config())
            config = sync.load_config(path)
            self.assertEqual(sync.enabled_destinations(config), (True, False))

    def test_rejects_partial_notion_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            values = self.dashboard_config()
            values["notion_token"] = "notion"
            self.write_config(path, values)
            with self.assertRaisesRegex(ValueError, "must either both be set"):
                sync.load_config(path)

    def test_rejects_config_without_destination(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            values = {
                "ig_session_id": "session",
                "ig_csrftoken": "csrf",
                "ig_user_id": "user",
            }
            self.write_config(path, values)
            with self.assertRaisesRegex(ValueError, "at least one destination"):
                sync.load_config(path)

    def test_rejects_partial_dashboard_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            values = self.base_config()
            values["dashboard_ingest_url"] = "https://example.vercel.app/api/ingest"
            self.write_config(path, values)
            with self.assertRaisesRegex(ValueError, "must either both be set"):
                sync.load_config(path)

    def test_rejects_insecure_remote_dashboard_url(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            values = self.base_config()
            values.update(
                {
                    "dashboard_ingest_url": "http://example.com/api/ingest",
                    "dashboard_ingestion_secret": "a" * 32,
                }
            )
            self.write_config(path, values)
            with self.assertRaisesRegex(ValueError, "must use HTTPS"):
                sync.load_config(path)


class NotionWriteTests(unittest.TestCase):
    def test_uses_data_source_parent(self):
        calls = []

        class Pages:
            def create(self, **kwargs):
                calls.append(kwargs)

        class Client:
            pages = Pages()

        sync.sync_post(
            Client(),
            "c40405c6-c4c4-4557-b1ef-16ffff0f5679",
            {
                "media_id": "123",
                "code": "ABC",
                "author": "creator",
                "caption": "caption",
                "url": "https://www.instagram.com/p/ABC/",
                "content_type": "Post",
                "duration_sec": 0,
            },
        )
        self.assertEqual(
            calls[0]["parent"],
            {
                "type": "data_source_id",
                "data_source_id": "c40405c6-c4c4-4557-b1ef-16ffff0f5679",
            },
        )

    def test_writes_positive_duration(self):
        properties = sync.notion_properties(
            {
                "media_id": "123",
                "code": "ABC",
                "author": "creator",
                "caption": "caption",
                "url": "https://www.instagram.com/reel/ABC/",
                "content_type": "Reel",
                "duration_sec": 37.0,
            }
        )
        self.assertEqual(properties["Duration Sec"], {"number": 37.0})

    def test_dashboard_payload_uses_normalized_fields(self):
        payload = sync.dashboard_payload(
            {
                "media_id": "123",
                "code": "ABC",
                "author": "creator",
                "caption": "caption",
                "url": "https://www.instagram.com/reel/ABC/",
                "content_type": "Reel",
                "duration_sec": 37.0,
            }
        )
        self.assertEqual(payload["instagram_media_id"], "123")
        self.assertEqual(payload["duration_seconds"], 37.0)


class DashboardWriteTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "dashboard_ingest_url": "https://example.vercel.app/api/ingest",
            "dashboard_ingestion_secret": "a" * 32,
        }
        self.post = {
            "media_id": "123",
            "code": "ABC",
            "author": "creator",
            "caption": "caption",
            "url": "https://www.instagram.com/reel/ABC/",
            "content_type": "Reel",
            "duration_sec": 37.0,
        }

    def response(self, status_code, headers=None):
        response = Mock(spec=requests.Response)
        response.status_code = status_code
        response.ok = 200 <= status_code < 300
        response.headers = headers or {}
        if not response.ok:
            response.raise_for_status.side_effect = requests.HTTPError(str(status_code))
        return response

    def test_retries_transient_dashboard_failure(self):
        request_post = Mock(side_effect=[self.response(503), self.response(201)])
        sleep = Mock()
        sync.sync_post_to_dashboard(
            self.config,
            self.post,
            request_post=request_post,
            sleep=sleep,
        )
        self.assertEqual(request_post.call_count, 2)
        sleep.assert_called_once_with(1.0)

    def test_does_not_retry_unauthorized_dashboard_failure(self):
        request_post = Mock(return_value=self.response(401))
        with self.assertRaises(requests.HTTPError):
            sync.sync_post_to_dashboard(
                self.config,
                self.post,
                request_post=request_post,
                sleep=Mock(),
            )
        self.assertEqual(request_post.call_count, 1)

    def test_sends_only_approved_analysis_evidence(self):
        response = self.response(200)
        response.json.return_value = {"skipped": False}
        request_post = Mock(return_value=response)
        inspector = Mock(return_value={
            "transcript": "Spoken words",
            "visual_observations": "Vertical video with two sampled transitions.",
            "visual_frames": [{
                "label": "Opening frame at 0.0s",
                "data_url": "data:image/jpeg;base64,ZmFrZQ==",
            }],
        })
        analyzed = sync.sync_post_analysis_to_dashboard(
            self.config,
            {**self.post, "_analysis_assets": [{"url": "private", "kind": "video"}]},
            inspector=inspector,
            request_post=request_post,
        )
        request = request_post.call_args
        self.assertEqual(request.args[0], "https://example.vercel.app/api/ingest/analyze")
        self.assertEqual(request.kwargs["json"]["transcript"], "Spoken words")
        self.assertEqual(request.kwargs["json"]["visual_frames"][0]["label"], "Opening frame at 0.0s")
        self.assertNotIn("_analysis_assets", request.kwargs["json"])
        self.assertTrue(analyzed)

    def test_reports_used_save_as_already_complete(self):
        response = self.response(200)
        response.json.return_value = {"skipped": True, "reason": "Production item already exists."}
        analyzed = sync.sync_post_analysis_to_dashboard(
            self.config,
            {**self.post, "_analysis_assets": [{"url": "private", "kind": "video"}]},
            inspector=Mock(return_value={"transcript": "Spoken words"}),
            request_post=Mock(return_value=response),
        )
        self.assertFalse(analyzed)

    def test_surfaces_safe_dashboard_analysis_error(self):
        response = self.response(500)
        response.json.return_value = {"error": "Structured analysis failed validation."}
        with self.assertRaisesRegex(
            RuntimeError,
            r"Dashboard analysis failed \(500\): Structured analysis failed validation\.",
        ):
            sync.sync_post_analysis_to_dashboard(
                self.config,
                {**self.post, "_analysis_assets": [{"url": "private", "kind": "video"}]},
                inspector=Mock(return_value={"transcript": "Spoken words"}),
                request_post=Mock(return_value=response),
            )


class DashboardOnlyMainFlowTests(unittest.TestCase):
    def test_dashboard_sync_does_not_require_notion_and_uses_separate_dedupe(self):
        config = {
            "ig_session_id": "session",
            "ig_csrftoken": "csrf",
            "ig_user_id": "user",
            "dashboard_ingest_url": "https://example.vercel.app/api/ingest",
            "dashboard_ingestion_secret": "a" * 32,
            "enable_automatic_media_analysis": True,
        }
        state = {
            "account_id": "user",
            "synced_ids": ["123"],
            "dashboard_synced_ids": [],
            "last_sync": None,
        }
        post = {
            "media_id": "123",
            "code": "ABC",
            "author": "creator",
            "caption": "caption",
            "url": "https://www.instagram.com/reel/ABC/",
            "content_type": "Reel",
            "duration_sec": 37.0,
        }

        with (
            patch.object(sync, "load_config", return_value=config),
            patch.object(sync, "load_state", return_value=state),
            patch.object(sync, "build_session", return_value=Mock()),
            patch.object(sync, "validate_session"),
            patch.object(sync, "fetch_saved_posts", return_value=[post]),
            patch.object(sync, "sync_post") as notion_write,
            patch.object(sync, "sync_post_to_dashboard") as dashboard_write,
            patch.object(sync, "sync_post_analysis_to_dashboard") as dashboard_analysis,
            patch.object(sync, "save_state") as save_state,
            patch.object(sync.time, "sleep"),
            patch.object(sync, "NotionClient", None),
            patch("sys.argv", ["sync.py", "--all-saves"]),
        ):
            result = sync.main()

        self.assertEqual(result, 0)
        notion_write.assert_not_called()
        dashboard_write.assert_called_once_with(config, post)
        dashboard_analysis.assert_called_once_with(config, post)
        self.assertEqual(state["synced_ids"], ["123"])
        self.assertEqual(state["dashboard_synced_ids"], ["123"])
        self.assertEqual(state["dashboard_analyzed_ids"], ["123"])
        self.assertGreaterEqual(save_state.call_count, 2)


if __name__ == "__main__":
    unittest.main()
