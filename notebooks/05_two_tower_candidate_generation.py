"""Train an offline two-tower candidate generator from Twitch follow signals."""

from pathlib import Path

import pandas as pd

from two_tower_model import recommend


TOP_K = 50


def load_jsonl(data_dir: Path, name: str) -> pd.DataFrame:
    path = data_dir / f"{name}.jsonl"
    return pd.read_json(path, lines=True) if path.exists() else pd.DataFrame()


def main() -> None:
    notebook_dir = (
        Path.cwd() if Path.cwd().name == "notebooks" else Path.cwd() / "notebooks"
    )
    data_dir = notebook_dir / "data"
    streams = load_jsonl(data_dir, "live_stream_features")
    followed_channels = load_jsonl(data_dir, "channels")
    followed_streams = load_jsonl(data_dir, "followed_streams")
    watch_time_history = load_jsonl(data_dir, "watch_time_history")

    if streams.empty:
        raise FileNotFoundError(
            f"Run 00_get_data.ipynb first to export {data_dir / 'live_stream_features.jsonl'}."
        )
    missing_columns = {"id", "user_id"} - set(streams.columns)
    if missing_columns:
        raise ValueError(
            f"The live-stream export is missing required columns: {sorted(missing_columns)}"
        )
    if "broadcaster_id" not in followed_channels:
        raise ValueError(
            "The channels export must include followed broadcaster_id values. "
            "Collect user-specific follows in 00_get_data.ipynb first."
        )
    if not followed_channels["broadcaster_id"].dropna().astype(str).any():
        raise ValueError(
            "No followed channels were exported; the two-tower proxy has no user profile."
        )

    recommendations = recommend(
        streams.drop_duplicates("id").to_dict(orient="records"),
        followed_channels.to_dict(orient="records"),
        followed_streams.to_dict(orient="records"),
        user_id="offline-notebook-user",
        watch_time_history=watch_time_history.to_dict(orient="records"),
        top_k=TOP_K,
    )
    if not recommendations:
        raise ValueError(
            "The live snapshot needs both a followed live channel and non-followed "
            "candidates to train the two-tower model."
        )

    candidates = pd.DataFrame(recommendations)
    output_path = data_dir / "two_tower_top_50.jsonl"
    candidates.to_json(output_path, orient="records", lines=True, date_format="iso")
    print(f"Wrote {len(candidates)} candidates to {output_path}")
    columns = [
        column
        for column in (
            "rank",
            "user_name",
            "game_name",
            "title",
            "viewer_count",
            "two_tower_score",
        )
        if column in candidates
    ]
    print(candidates[columns].head(10))


if __name__ == "__main__":
    main()
