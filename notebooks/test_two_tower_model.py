import unittest
from datetime import datetime, timezone

from two_tower_model import (
    _matches_watched_stream,
    _watch_time_strength,
    build_item_tokens,
    build_user_tokens,
    recommend,
)


class WatchTimeRecommendationTests(unittest.TestCase):
    def test_longer_watch_increases_stream_and_category_affinity(self):
        stream = {"user_id": "mande", "game_id": "apex", "game_name": "Apex Legends"}
        short_watch = [{
            "broadcaster_id": "mande",
            "game_id": "apex",
            "game_name": "Apex Legends",
            "watch_seconds": 60,
        }]
        long_watch = [{**short_watch[0], "watch_seconds": 600}]

        self.assertGreater(
            _watch_time_strength(stream, long_watch),
            _watch_time_strength(stream, short_watch),
        )

    def test_watch_matches_same_channel_and_category(self):
        history = [{
            "broadcaster_id": "mande",
            "game_id": "apex",
            "game_name": "Apex Legends",
            "watch_seconds": 600,
        }]

        self.assertTrue(_matches_watched_stream(
            {"user_id": "mande", "game_id": "other", "game_name": "Other"},
            history,
        ))
        self.assertTrue(_matches_watched_stream(
            {"user_id": "other", "game_id": "apex", "game_name": "Apex Legends"},
            history,
        ))
        self.assertFalse(_matches_watched_stream(
            {"user_id": "other", "game_id": "other", "game_name": "Other"},
            history,
        ))

    def test_watched_channel_scores_above_another_channel_in_same_category(self):
        history = [{
            "broadcaster_id": "mande",
            "game_id": "apex",
            "game_name": "Apex Legends",
            "watch_seconds": 600,
        }]
        watched_channel = {
            "user_id": "mande",
            "game_id": "apex",
            "game_name": "Apex Legends",
        }
        category_match = {
            "user_id": "another",
            "game_id": "apex",
            "game_name": "Apex Legends",
        }

        self.assertGreater(
            _watch_time_strength(watched_channel, history),
            _watch_time_strength(category_match, history),
        )

    def test_longer_watch_weights_matching_user_tower_tokens_more(self):
        followed = ([], [], [], {})
        short_watch = [{
            "broadcaster_id": "mande",
            "game_id": "apex",
            "game_name": "Apex Legends",
            "watch_seconds": 60,
        }]
        long_watch = [{**short_watch[0], "watch_seconds": 600}]

        short_tokens = build_user_tokens(*followed, short_watch)
        long_tokens = build_user_tokens(*followed, long_watch)
        item_tokens = build_item_tokens({
            "user_id": "mande",
            "game_id": "apex",
            "game_name": "Apex Legends",
        })

        self.assertGreater(long_tokens.count("channel:mande"), short_tokens.count("channel:mande"))
        self.assertTrue(set(item_tokens).intersection(long_tokens))


class SavedChannelRecommendationTests(unittest.TestCase):
    def test_saved_channel_adds_channel_and_category_affinity_tokens(self):
        tokens = build_user_tokens(
            [],
            [],
            [],
            {},
            saved_channels=[{
                "broadcaster_id": "streamer-1",
                "game_id": "apex",
                "game_name": "Apex Legends",
            }],
        )

        self.assertIn("channel:streamer-1", tokens)
        self.assertIn("category:apex", tokens)
        self.assertIn("category_name:apex_legends", tokens)

    def test_saved_channel_and_category_rank_above_unrelated_streams(self):
        streams = [
            {
                "id": "saved-stream",
                "user_id": "streamer-1",
                "game_id": "apex",
                "game_name": "Apex Legends",
                "language": "en",
                "tags": [],
                "viewer_count": 500,
                "started_at": "2026-01-01T00:00:00Z",
                "title": "Saved streamer",
            },
            {
                "id": "similar-stream",
                "user_id": "streamer-2",
                "game_id": "apex",
                "game_name": "Apex Legends",
                "language": "en",
                "tags": [],
                "viewer_count": 1000,
                "started_at": "2026-01-01T00:00:00Z",
                "title": "Similar category",
            },
            {
                "id": "unrelated-stream",
                "user_id": "streamer-3",
                "game_id": "valorant",
                "game_name": "VALORANT",
                "language": "en",
                "tags": [],
                "viewer_count": 10000,
                "started_at": "2026-01-01T00:00:00Z",
                "title": "Unrelated category",
            },
        ]

        ranked = recommend(
            streams,
            [],
            [],
            user_id="user-1",
            saved_channels=[{
                "broadcaster_id": "streamer-1",
                "game_id": "apex",
                "game_name": "Apex Legends",
            }],
            now=datetime(2026, 1, 2, tzinfo=timezone.utc),
            top_k=3,
        )

        self.assertEqual(
            [stream["id"] for stream in ranked],
            ["saved-stream", "similar-stream", "unrelated-stream"],
        )


if __name__ == "__main__":
    unittest.main()
