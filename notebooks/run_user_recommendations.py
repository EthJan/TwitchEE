"""Generate user recommendations from app-owned Twitch snapshots.

The app fetches Twitch data with the user's OAuth token. This job only reads
sanitized snapshots from Postgres and never handles Twitch credentials.
"""

import json
import math
import os
from datetime import datetime, timezone

import psycopg
from psycopg.types.json import Jsonb


def latest_context(connection, user_id: str, dataset: str) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT DISTINCT ON (record_key) payload
            FROM twitch_user_context_records
            WHERE user_id = %s AND dataset = %s
            ORDER BY record_key, collected_at DESC
            """,
            (user_id, dataset),
        )
        return [row[0] for row in cursor.fetchall()]


def live_streams(connection) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT payload
            FROM twitch_current_streams
            WHERE last_seen_at > NOW() - INTERVAL '10 minutes'
            ORDER BY viewer_count DESC
            """
        )
        return [row[0] for row in cursor.fetchall()]


def recommend(streams: list[dict], channels: list[dict], followed_streams: list[dict]):
    followed_ids = {str(row.get("broadcaster_id")) for row in channels}
    followed_games = {
        str(row.get("game_id"))
        for row in followed_streams
        if row.get("game_id")
    }

    ranked = []
    for stream in streams:
        score = math.log1p(max(int(stream.get("viewer_count", 0)), 0))
        if str(stream.get("user_id")) in followed_ids:
            score += 10
        if str(stream.get("game_id")) in followed_games:
            score += 3
        ranked.append((score, stream))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        {
            **stream,
            "recommendation_score": score,
            "rank": rank,
        }
        for rank, (score, stream) in enumerate(ranked[:50], start=1)
    ]


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    requested_user_id = os.environ.get("TWITCH_RECOMMENDATION_USER_ID")
    collected_at = datetime.now(timezone.utc)

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            if requested_user_id:
                user_ids = [requested_user_id]
            else:
                cursor.execute(
                    "SELECT DISTINCT user_id FROM twitch_user_context_records"
                )
                user_ids = [str(row[0]) for row in cursor.fetchall()]

        streams = live_streams(connection)
        total = 0
        for user_id in user_ids:
            recommendations = recommend(
                streams,
                latest_context(connection, user_id, "followed_channels"),
                latest_context(connection, user_id, "followed_streams"),
            )
            if not recommendations:
                continue
            rows = [
                (user_id, str(stream["id"]), collected_at, Jsonb(stream))
                for stream in recommendations
            ]
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO twitch_user_recommendation_records
                        (user_id, record_key, collected_at, payload)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_id, record_key, collected_at)
                    DO UPDATE SET payload = EXCLUDED.payload
                    """,
                    rows,
                )
            total += len(rows)

    print(json.dumps({"users": len(user_ids), "recommendations": total}))


if __name__ == "__main__":
    main()
