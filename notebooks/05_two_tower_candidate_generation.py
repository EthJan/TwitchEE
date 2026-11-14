"""Train an offline two-tower candidate generator from Twitch follow signals."""

import random
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.nn import functional as F


SEED = 42
EMBEDDING_SIZE = 32
NEGATIVES_PER_POSITIVE = 4
EPOCHS = 40
BATCH_SIZE = 256
TOP_K = 50

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)


def load_jsonl(data_dir: Path, name: str) -> pd.DataFrame:
    path = data_dir / f"{name}.jsonl"
    return pd.read_json(path, lines=True) if path.exists() else pd.DataFrame()


def clean_token(value: object) -> str:
    return str(value).strip().lower().replace(" ", "_")


def build_user_tokens(
    followed_channels: pd.DataFrame,
    followed_streams: pd.DataFrame,
) -> list[str]:
    tokens = [
        f"channel:{clean_token(channel_id)}"
        for channel_id in followed_channels.get(
            "broadcaster_id", pd.Series(dtype=str)
        ).dropna()
    ]
    if "game_id" in followed_streams:
        tokens.extend(
            f"category:{clean_token(game_id)}"
            for game_id in followed_streams["game_id"].dropna()
        )
    return list(dict.fromkeys(tokens))


def build_item_tokens(row: pd.Series) -> list[str]:
    tokens = []
    for column, prefix in (
        ("user_id", "channel"),
        ("game_id", "category"),
        ("language", "language"),
    ):
        value = row.get(column)
        if pd.notna(value) and str(value).strip():
            tokens.append(f"{prefix}:{clean_token(value)}")

    tags = row.get("tags", [])
    if isinstance(tags, list):
        tokens.extend(
            f"tag:{clean_token(tag)}"
            for tag in tags
            if pd.notna(tag) and str(tag).strip()
        )
    return list(dict.fromkeys(tokens))


def pad_token_sequences(
    sequences: list[list[int]],
) -> tuple[torch.Tensor, torch.Tensor]:
    max_length = max(1, max(map(len, sequences), default=0))
    values = np.zeros((len(sequences), max_length), dtype=np.int64)
    for index, sequence in enumerate(sequences):
        values[index, : len(sequence)] = sequence
    tensor = torch.as_tensor(values, dtype=torch.long)
    return tensor, tensor.ne(0)


class TwoTower(nn.Module):
    def __init__(self, vocabulary_size: int, numeric_size: int):
        super().__init__()
        self.user_tokens = nn.Embedding(
            vocabulary_size, EMBEDDING_SIZE, padding_idx=0
        )
        self.item_tokens = nn.Embedding(
            vocabulary_size, EMBEDDING_SIZE, padding_idx=0
        )
        self.user_encoder = nn.Sequential(
            nn.Linear(EMBEDDING_SIZE, 64),
            nn.ReLU(),
            nn.Linear(64, EMBEDDING_SIZE),
        )
        self.item_encoder = nn.Sequential(
            nn.Linear(EMBEDDING_SIZE + numeric_size, 64),
            nn.ReLU(),
            nn.Linear(64, EMBEDDING_SIZE),
        )

    @staticmethod
    def mean_pool(
        embedding: nn.Embedding,
        token_ids: torch.Tensor,
        mask: torch.Tensor,
    ) -> torch.Tensor:
        token_vectors = embedding(token_ids)
        masked_vectors = token_vectors * mask.unsqueeze(-1)
        return masked_vectors.sum(dim=1) / mask.sum(dim=1, keepdim=True).clamp(min=1)

    def encode_user(self, token_ids: torch.Tensor) -> torch.Tensor:
        mask = token_ids.ne(0)
        pooled = self.mean_pool(self.user_tokens, token_ids, mask)
        return F.normalize(self.user_encoder(pooled), p=2, dim=1)

    def encode_items(
        self,
        token_ids: torch.Tensor,
        numeric_features: torch.Tensor,
    ) -> torch.Tensor:
        mask = token_ids.ne(0)
        pooled = self.mean_pool(self.item_tokens, token_ids, mask)
        features = torch.cat((pooled, numeric_features), dim=1)
        return F.normalize(self.item_encoder(features), p=2, dim=1)

    def forward(
        self,
        user_token_ids: torch.Tensor,
        item_token_ids: torch.Tensor,
        numeric_features: torch.Tensor,
    ) -> torch.Tensor:
        user_embedding = self.encode_user(user_token_ids)
        item_embedding = self.encode_items(item_token_ids, numeric_features)
        return (user_embedding * item_embedding).sum(dim=1) * 10


def main() -> None:
    notebook_dir = (
        Path.cwd() if Path.cwd().name == "notebooks" else Path.cwd() / "notebooks"
    )
    data_dir = notebook_dir / "data"
    streams = load_jsonl(data_dir, "live_stream_features")
    followed_channels = load_jsonl(data_dir, "channels")
    followed_streams = load_jsonl(data_dir, "followed_streams")

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

    followed_ids = set(followed_channels["broadcaster_id"].dropna().astype(str))
    if not followed_ids:
        raise ValueError(
            "No followed channels were exported; the two-tower proxy has no user profile."
        )

    candidates = streams.copy()
    candidates["user_id"] = candidates["user_id"].astype(str)
    candidates = candidates.drop_duplicates("id").reset_index(drop=True)
    positive_mask = candidates["user_id"].isin(followed_ids)
    positive_indices = np.flatnonzero(positive_mask.to_numpy())
    negative_indices = np.flatnonzero(~positive_mask.to_numpy())
    if not len(positive_indices):
        raise ValueError(
            "No currently-live followed channels appear in the candidate snapshot. "
            "Collect a different snapshot; this experiment does not invent positive labels."
        )
    if not len(negative_indices):
        raise ValueError(
            "The live snapshot contains no non-followed candidates for negative sampling."
        )

    user_tokens = build_user_tokens(followed_channels, followed_streams)
    if not user_tokens:
        raise ValueError("No usable follow features were found for the user tower.")

    item_sequences = candidates.apply(build_item_tokens, axis=1).tolist()
    if any(not sequence for sequence in item_sequences):
        raise ValueError("Every candidate needs at least one categorical metadata token.")
    vocabulary = sorted(
        {token for sequence in item_sequences for token in sequence}
        | set(user_tokens)
    )
    token_to_id = {token: index + 1 for index, token in enumerate(vocabulary)}
    user_token_ids, _ = pad_token_sequences(
        [[token_to_id[token] for token in user_tokens]]
    )
    item_token_ids, _ = pad_token_sequences(
        [
            [token_to_id[token] for token in sequence]
            for sequence in item_sequences
        ]
    )

    viewer_count = pd.to_numeric(
        candidates.get("viewer_count", pd.Series(0, index=candidates.index)),
        errors="coerce",
    ).fillna(0)
    numeric_features = pd.DataFrame(
        {
            "viewer_log1p": np.log1p(viewer_count.clip(lower=0)),
            "stream_age_hours": pd.to_numeric(
                candidates.get("stream_age_hours", 0), errors="coerce"
            ),
            "tag_count": pd.to_numeric(
                candidates.get("tag_count", 0), errors="coerce"
            ),
            "title_length": pd.to_numeric(
                candidates.get("title_length", 0), errors="coerce"
            ),
        },
        index=candidates.index,
    ).fillna(0)
    numeric_mean = numeric_features.mean()
    numeric_std = numeric_features.std().replace(0, 1).fillna(1)
    numeric_values = torch.as_tensor(
        ((numeric_features - numeric_mean) / numeric_std).to_numpy(),
        dtype=torch.float32,
    )

    model = TwoTower(len(vocabulary) + 1, numeric_values.shape[1])
    optimizer = torch.optim.Adam(model.parameters(), lr=0.005, weight_decay=1e-5)
    loss_function = nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor(float(NEGATIVES_PER_POSITIVE))
    )
    rng = np.random.default_rng(SEED)
    user_token_ids = user_token_ids.expand(BATCH_SIZE, -1)

    print(
        {
            "candidates": len(candidates),
            "followed_channel_positives": len(positive_indices),
            "sampled_negative_pool": len(negative_indices),
            "user_tokens": len(user_tokens),
            "item_vocabulary": len(vocabulary),
        }
    )

    for epoch in range(EPOCHS):
        negative_sample_size = len(positive_indices) * NEGATIVES_PER_POSITIVE
        sampled_negatives = rng.choice(
            negative_indices,
            size=(len(positive_indices), NEGATIVES_PER_POSITIVE),
            replace=len(negative_indices) < negative_sample_size,
        )
        training_items = np.concatenate(
            (positive_indices, sampled_negatives.reshape(-1))
        )
        labels = np.concatenate(
            (
                np.ones(len(positive_indices), dtype=np.float32),
                np.zeros(sampled_negatives.size, dtype=np.float32),
            )
        )
        permutation = rng.permutation(len(training_items))
        epoch_loss = 0.0
        model.train()

        for start in range(0, len(permutation), BATCH_SIZE):
            batch_indices = permutation[start : start + BATCH_SIZE]
            item_indices = torch.as_tensor(training_items[batch_indices])
            batch_size = len(batch_indices)
            batch_user_tokens = user_token_ids[:batch_size]
            logits = model(
                batch_user_tokens,
                item_token_ids[item_indices],
                numeric_values[item_indices],
            )
            batch_labels = torch.as_tensor(labels[batch_indices])
            loss = loss_function(logits, batch_labels)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * batch_size

        if epoch in {0, 9, 19, EPOCHS - 1}:
            print(f"epoch={epoch + 1}, loss={epoch_loss / len(permutation):.4f}")

    model.eval()
    with torch.no_grad():
        user_embedding = model.encode_user(user_token_ids[:1])
        item_embeddings = model.encode_items(item_token_ids, numeric_values)
        scores = (item_embeddings @ user_embedding.squeeze(0)).numpy()

    candidates["two_tower_score"] = scores
    candidates = candidates.sort_values(
        ["two_tower_score", "viewer_count"],
        ascending=[False, False],
    ).head(TOP_K).reset_index(drop=True)
    candidates.insert(0, "rank", candidates.index + 1)

    output_path = data_dir / "two_tower_top_50.jsonl"
    candidates.to_json(output_path, orient="records", lines=True, date_format="iso")
    print(f"Wrote {len(candidates)} candidates to {output_path}")
    print(
        candidates[
            [
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
        ].head(10)
    )


if __name__ == "__main__":
    main()
