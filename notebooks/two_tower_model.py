"""Content-based two-tower ranking for live Twitch streams."""

import hashlib
import math
from datetime import datetime, timezone

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


EMBEDDING_SIZE = 32
NEGATIVES_PER_POSITIVE = 4
EPOCHS = 40
TOP_K = 50
MODEL_SCORE_WEIGHT = 0.1
CATEGORY_MATCH_WEIGHT = 0.7
FOLLOWED_CHANNEL_WEIGHT = 0.2


def clean_token(value: object) -> str:
    return str(value).strip().lower().replace(" ", "_")


def build_user_tokens(
    followed_channels: list[dict],
    followed_streams: list[dict],
    followed_channel_profiles: list[dict],
) -> list[str]:
    tokens = [
        f"channel:{clean_token(channel_id)}"
        for channel_id in (
            row.get("broadcaster_id") for row in followed_channels
        )
        if channel_id is not None and str(channel_id).strip()
    ]
    tokens.extend(
        f"category:{clean_token(game_id)}"
        for game_id in (
            row.get("game_id")
            for row in (*followed_streams, *followed_channel_profiles)
        )
        if game_id is not None and str(game_id).strip()
    )
    tokens.extend(
        f"category_name:{clean_token(game_name)}"
        for game_name in (
            row.get("game_name")
            for row in (*followed_streams, *followed_channel_profiles)
        )
        if game_name is not None and str(game_name).strip()
    )
    return list(dict.fromkeys(tokens))


def build_item_tokens(stream: dict) -> list[str]:
    tokens = []
    for column, prefix in (
        ("user_id", "channel"),
        ("game_id", "category"),
        ("game_name", "category_name"),
        ("language", "language"),
    ):
        value = stream.get(column)
        if value is not None and str(value).strip():
            tokens.append(f"{prefix}:{clean_token(value)}")

    tags = stream.get("tags", [])
    if isinstance(tags, list):
        tokens.extend(
            f"tag:{clean_token(tag)}"
            for tag in tags
            if tag is not None and str(tag).strip()
        )
    return list(dict.fromkeys(tokens))


def pad_token_sequences(sequences: list[list[int]]) -> torch.Tensor:
    max_length = max(1, max(map(len, sequences), default=0))
    values = np.zeros((len(sequences), max_length), dtype=np.int64)
    for index, sequence in enumerate(sequences):
        values[index, : len(sequence)] = sequence
    return torch.tensor(values, dtype=torch.long)


def _stream_age_hours(stream: dict, now: datetime) -> float:
    started_at = stream.get("started_at")
    if not started_at:
        return 0.0
    try:
        started = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return max(0.0, (now - started).total_seconds() / 3600)


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
        pooled = self.mean_pool(self.user_tokens, token_ids, token_ids.ne(0))
        return F.normalize(self.user_encoder(pooled), p=2, dim=1)

    def encode_items(
        self,
        token_ids: torch.Tensor,
        numeric_features: torch.Tensor,
    ) -> torch.Tensor:
        pooled = self.mean_pool(self.item_tokens, token_ids, token_ids.ne(0))
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


def recommend(
    streams: list[dict],
    followed_channels: list[dict],
    followed_streams: list[dict],
    *,
    user_id: str,
    followed_channel_profiles: list[dict] | None = None,
    now: datetime | None = None,
    top_k: int = TOP_K,
) -> list[dict]:
    """Train a per-user two-tower ranker from followed channels and categories."""
    followed_channel_profiles = followed_channel_profiles or []
    user_tokens = build_user_tokens(
        followed_channels,
        followed_streams,
        followed_channel_profiles,
    )
    followed_ids = {
        str(row.get("broadcaster_id"))
        for row in followed_channels
        if row.get("broadcaster_id") is not None
    }
    followed_games = {
        str(row.get("game_id"))
        for row in (*followed_streams, *followed_channel_profiles)
        if row.get("game_id") is not None and str(row.get("game_id")).strip()
    }
    followed_game_names = {
        clean_token(row["game_name"])
        for row in (*followed_streams, *followed_channel_profiles)
        if row.get("game_name")
    }
    followed_categories_by_channel = {
        str(row.get("broadcaster_id") or row.get("user_id")): (
            str(row.get("game_id") or ""),
            clean_token(row.get("game_name") or ""),
        )
        for row in followed_channel_profiles
        if row.get("broadcaster_id") or row.get("user_id")
    }
    for row in followed_streams:
        channel_id = str(row.get("user_id") or "")
        if channel_id and channel_id not in followed_categories_by_channel:
            followed_categories_by_channel[channel_id] = (
                str(row.get("game_id") or ""),
                clean_token(row.get("game_name") or ""),
            )
    followed_category_counts: dict[str, int] = {}
    for game_id, game_name in followed_categories_by_channel.values():
        category = game_id or f"name:{game_name}"
        if category and category != "name:":
            followed_category_counts[category] = (
                followed_category_counts.get(category, 0) + 1
            )
    candidates = list({str(stream.get("id")): stream for stream in streams}.values())
    positive_indices = [
        index for index, stream in enumerate(candidates)
        if (
            str(stream.get("user_id")) in followed_ids
            or (
                _matches_followed_category(
                    stream, followed_games, followed_game_names
                )
            )
        )
    ]
    positive_index_set = set(positive_indices)
    negative_indices = [
        index for index in range(len(candidates))
        if index not in positive_index_set
    ]
    if not user_tokens or not positive_indices or not negative_indices:
        return []

    item_sequences = [build_item_tokens(stream) for stream in candidates]
    if any(not sequence for sequence in item_sequences):
        raise ValueError("Every live stream candidate needs channel metadata.")

    vocabulary = sorted(
        {token for sequence in item_sequences for token in sequence}
        | set(user_tokens)
    )
    token_to_id = {token: index + 1 for index, token in enumerate(vocabulary)}
    user_token_ids = pad_token_sequences(
        [[token_to_id[token] for token in user_tokens]]
    )
    item_token_ids = pad_token_sequences(
        [
            [token_to_id[token] for token in sequence]
            for sequence in item_sequences
        ]
    )

    now = now or datetime.now(timezone.utc)
    numeric_features = np.asarray(
        [
            [
                math.log1p(max(float(stream.get("viewer_count") or 0), 0)),
                _stream_age_hours(stream, now),
                len(stream.get("tags", []))
                if isinstance(stream.get("tags"), list)
                else 0,
                len(str(stream.get("title") or "")),
            ]
            for stream in candidates
        ],
        dtype=np.float32,
    )
    feature_mean = numeric_features.mean(axis=0)
    feature_std = numeric_features.std(axis=0)
    feature_std[feature_std == 0] = 1
    numeric_values = torch.tensor(
        (numeric_features - feature_mean) / feature_std,
        dtype=torch.float32,
    )

    seed = int.from_bytes(
        hashlib.sha256(user_id.encode("utf-8")).digest()[:4], "big"
    )
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    model = TwoTower(len(vocabulary) + 1, numeric_values.shape[1])
    optimizer = torch.optim.Adam(model.parameters(), lr=0.005, weight_decay=1e-5)
    loss_function = nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor(float(NEGATIVES_PER_POSITIVE))
    )

    for _ in range(EPOCHS):
        negative_sample_size = len(positive_indices) * NEGATIVES_PER_POSITIVE
        sampled_negatives = rng.choice(
            negative_indices,
            size=negative_sample_size,
            replace=len(negative_indices) < negative_sample_size,
        )
        training_indices = np.concatenate(
            (positive_indices, sampled_negatives)
        )
        labels = torch.tensor(
            [1.0] * len(positive_indices) + [0.0] * len(sampled_negatives),
            dtype=torch.float32,
        )
        user_batch = user_token_ids.expand(len(training_indices), -1)
        logits = model(
            user_batch,
            item_token_ids[torch.tensor(training_indices, dtype=torch.long)],
            numeric_values[torch.tensor(training_indices, dtype=torch.long)],
        )
        loss = loss_function(logits, labels)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        user_embedding = model.encode_user(user_token_ids)
        item_embeddings = model.encode_items(item_token_ids, numeric_values)
        scores = (item_embeddings @ user_embedding.squeeze(0)).tolist()

    ranked = []
    for model_score, stream in zip(scores, candidates):
        category_strength = _followed_category_strength(
            stream,
            followed_games,
            followed_game_names,
            followed_category_counts,
        )
        followed_channel = str(stream.get("user_id")) in followed_ids
        normalized_model_score = min(max((model_score + 1) / 2, 0), 1)
        recommendation_score = (
            CATEGORY_MATCH_WEIGHT * category_strength
            + FOLLOWED_CHANNEL_WEIGHT * followed_channel
            + MODEL_SCORE_WEIGHT * normalized_model_score
        )
        ranked.append((recommendation_score, model_score, stream))

    ranked.sort(
        key=lambda item: (
            item[0],
            item[1],
            float(item[2].get("viewer_count") or 0),
        ),
        reverse=True,
    )
    ranked = ranked[:top_k]
    return [
        {
            **stream,
            "two_tower_score": float(model_score),
            "recommendation_score": float(recommendation_score),
            "rank": rank,
        }
        for rank, (recommendation_score, model_score, stream) in enumerate(
            ranked, start=1
        )
    ]


def _matches_followed_category(
    stream: dict,
    followed_game_ids: set[str],
    followed_game_names: set[str],
) -> bool:
    game_id = str(stream.get("game_id") or "")
    game_name = clean_token(stream.get("game_name") or "")
    return (
        (bool(game_id) and game_id in followed_game_ids)
        or (bool(game_name) and game_name in followed_game_names)
    )


def _followed_category_strength(
    stream: dict,
    followed_game_ids: set[str],
    followed_game_names: set[str],
    followed_category_counts: dict[str, int],
) -> float:
    if not _matches_followed_category(
        stream, followed_game_ids, followed_game_names
    ):
        return 0.0
    game_id = str(stream.get("game_id") or "")
    game_name = clean_token(stream.get("game_name") or "")
    category = game_id if game_id in followed_game_ids else f"name:{game_name}"
    max_count = max(followed_category_counts.values(), default=1)
    return followed_category_counts.get(category, 1) / max_count
