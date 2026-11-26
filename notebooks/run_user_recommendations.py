"""Generate user recommendations from app-owned Twitch snapshots.

The app fetches Twitch data with the user's OAuth token. This job only reads
sanitized snapshots from Postgres and never handles Twitch credentials.
"""

import json
import os
from datetime import datetime, timezone

import psycopg
from psycopg.types.json import Jsonb
from two_tower_model import recommend


def latest_context(
    connection,
    user_id: str,
    dataset: str,
    fresh_minutes: int | None = None,
) -> list[dict]:
    with connection.cursor() as cursor:
        query = """
            SELECT DISTINCT ON (record_key) payload
            FROM twitch_user_context_records
            WHERE user_id = %s AND dataset = %s
        """
        params = (user_id, dataset)
        if dataset in {"followed_channels", "followed_channel_profiles"}:
            query += """
                AND collected_at = (
                    SELECT MAX(collected_at)
                    FROM twitch_user_context_records
                    WHERE user_id = %s AND dataset = %s
                )
            """
            params += (user_id, dataset)
        if fresh_minutes is not None:
            query += " AND collected_at > NOW() - (%s * INTERVAL '1 minute')"
            params += (fresh_minutes,)
        query += " ORDER BY record_key, collected_at DESC"
        cursor.execute(
            query,
            params,
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


def streamer_category_history(
    connection,
    broadcaster_ids: list[str],
) -> dict[str, dict[str, int]]:
    if not broadcaster_ids:
        return {}

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                payload->>'user_id' AS broadcaster_id,
                payload->>'game_id' AS game_id,
                COUNT(*) AS stream_snapshots
            FROM twitch_recommendation_records
            WHERE dataset = 'live_streams_raw'
              AND collected_at > NOW() - INTERVAL '30 days'
              AND payload->>'user_id' = ANY(%s)
              AND NULLIF(payload->>'game_id', '') IS NOT NULL
            GROUP BY payload->>'user_id', payload->>'game_id'
            """,
            (broadcaster_ids,),
        )
        history: dict[str, dict[str, int]] = {}
        for broadcaster_id, game_id, snapshots in cursor.fetchall():
            history.setdefault(str(broadcaster_id), {})[str(game_id)] = int(
                snapshots
            )
        return history


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
            followed_channels = latest_context(
                connection, user_id, "followed_channels"
            )
            followed_streams = latest_context(
                connection, user_id, "followed_streams", fresh_minutes=10
            )
            followed_channel_profiles = latest_context(
                connection,
                user_id,
                "followed_channel_profiles",
                fresh_minutes=10,
            )
            category_streams = latest_context(
                connection,
                user_id,
                "followed_category_streams",
                fresh_minutes=10,
            )
            candidates = {
                str(stream["id"]): stream
                for stream in (*streams, *followed_streams, *category_streams)
                if stream.get("id")
            }
            candidate_streams = list(candidates.values())
            followed_broadcaster_ids = [
                str(channel["broadcaster_id"])
                for channel in followed_channels
                if channel.get("broadcaster_id")
            ]
            category_history = streamer_category_history(
                connection,
                list(
                    {
                        *followed_broadcaster_ids,
                        *(
                            str(stream["user_id"])
                            for stream in candidate_streams
                            if stream.get("user_id")
                        ),
                    }
                ),
            )
            two_tower_recommendations = recommend(
                candidate_streams,
                followed_channels,
                followed_streams,
                user_id=user_id,
                followed_channel_profiles=followed_channel_profiles,
                streamer_category_history=category_history,
            )
            if not two_tower_recommendations:
                continue
            rows = [
                (
                    user_id,
                    str(stream["id"]),
                    collected_at,
                    Jsonb({
                        **stream,
                        "recommendation_model": "two_tower",
                    }),
                )
                for stream in two_tower_recommendations
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
