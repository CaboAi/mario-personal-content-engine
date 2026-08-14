import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "runtime" / "media_analysis.py"
SPEC = importlib.util.spec_from_file_location("media_analysis", MODULE_PATH)
media_analysis = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(media_analysis)


class MediaAssetTests(unittest.TestCase):
    def test_selects_highest_resolution_video(self):
        assets = media_analysis.extract_media_assets({
            "video_versions": [
                {"url": "https://low.fbcdn.net/a.mp4", "width": 360, "height": 640},
                {"url": "https://high.fbcdn.net/a.mp4", "width": 1080, "height": 1920},
            ]
        })
        self.assertEqual(assets[0]["url"], "https://high.fbcdn.net/a.mp4")
        self.assertEqual(assets[0]["kind"], "video")

    def test_preserves_carousel_order_and_caps_at_ten(self):
        assets = media_analysis.extract_media_assets({
            "carousel_media": [
                {"image_versions2": {"candidates": [{
                    "url": f"https://slide{index}.cdninstagram.com/a.jpg",
                    "width": 1080,
                    "height": 1350,
                }]}}
                for index in range(12)
            ]
        })
        self.assertEqual(len(assets), 10)
        self.assertEqual([asset["index"] for asset in assets], list(range(10)))

    def test_rejects_unexpected_download_hosts(self):
        with self.assertRaisesRegex(ValueError, "unexpected media host"):
            media_analysis.validate_media_url("https://example.com/save.mp4")

    def test_temporary_media_is_deleted_after_inspection(self):
        seen_paths = []

        def fake_download(_url, destination, **_kwargs):
            destination.write_bytes(b"temporary")
            seen_paths.append(destination)

        post = {"_analysis_assets": [{
            "kind": "video",
            "url": "https://scontent.example.fbcdn.net/save.mp4",
            "width": 1080,
            "height": 1920,
        }]}
        with (
            patch.object(media_analysis, "download_asset", side_effect=fake_download),
            patch.object(media_analysis, "transcribe_video", return_value=("transcript", "speech summary")),
            patch.object(media_analysis, "inspect_video_mechanics", return_value="visual summary"),
        ):
            with tempfile.TemporaryDirectory() as cache:
                result = media_analysis.inspect_saved_media(post, model_cache=Path(cache))

        self.assertEqual(result["transcript"], "transcript")
        self.assertTrue(seen_paths)
        self.assertFalse(seen_paths[0].exists())


if __name__ == "__main__":
    unittest.main()
