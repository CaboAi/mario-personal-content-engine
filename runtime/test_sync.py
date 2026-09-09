import unittest
import sys
from types import SimpleNamespace

if "requests" not in sys.modules:
    sys.modules["requests"] = SimpleNamespace(
        Session=object, post=None, get=None, HTTPError=Exception, RequestException=Exception, Response=object,
    )

from runtime.sync import configured_collections, dashboard_payload, merge_collection_post


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


if __name__ == "__main__":
    unittest.main()
