import unittest

from two_tower_model import (
    _matches_watched_stream,
    _watch_time_strength,
    build_item_tokens,
    build_user_tokens,
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


if __name__ == "__main__":
    unittest.main()
