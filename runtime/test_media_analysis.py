import unittest
import sys
from types import SimpleNamespace

if "requests" not in sys.modules:
    sys.modules["requests"] = SimpleNamespace(
        Session=object, post=None, get=None, HTTPError=Exception,
        RequestException=Exception, Response=object,
    )

from runtime.media_analysis import _payload_guard, plan_video_frame_targets


class RecreateFramePlanningTests(unittest.TestCase):
    def test_duration_scales_between_floor_and_ceiling(self):
        self.assertEqual(len(plan_video_frame_targets(12, [], recreate=True)), 6)
        self.assertEqual(len(plan_video_frame_targets(60, [], recreate=True)), 20)
        self.assertEqual(len(plan_video_frame_targets(180, [], recreate=True)), 20)

    def test_cut_targets_are_post_cut_and_no_cut_falls_back_to_uniform(self):
        targets = plan_video_frame_targets(30, [4, 10, 16], recreate=True)
        self.assertTrue(all((cut + 0.1, "post-cut") in targets for cut in [4, 10, 16]))
        no_cut = plan_video_frame_targets(30, [], recreate=True)
        self.assertEqual(len(no_cut), 10)
        self.assertTrue(all(kind in {"opening", "closing", "fill"} for _, kind in no_cut))

    def test_payload_guard_removes_fill_before_post_cut(self):
        frames = [
            {"kind": "opening", "data_url": "x" * 40},
            {"kind": "post-cut", "data_url": "x" * 40},
            {"kind": "fill", "data_url": "x" * 40},
            {"kind": "fill", "data_url": "x" * 40},
        ]
        kept = _payload_guard(frames, budget=100)
        self.assertEqual([frame["kind"] for frame in kept], ["opening", "post-cut"])


if __name__ == "__main__":
    unittest.main()
