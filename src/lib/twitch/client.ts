import 'server-only';

const twitchApiBaseUrl = 'https://api.twitch.tv/helix';
const twitchOAuthUrl = 'https://id.twitch.tv/oauth2/token';

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string[];
  token_type: string;
};

export type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
};

export type TwitchVideo = {
  id: string;
  stream_id: string | null;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
};

export type TwitchFollowedChannel = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  followed_at: string;
};

export type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: 'live' | '';
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tags: string[];
  is_mature: boolean;
};

export type TwitchGame = {
  id: string;
  name: string;
};

export type TwitchCategory = {
  id: string;
  name: string;
  box_art_url: string;
};

export type TwitchChannel = {
  id: string;
  broadcaster_language: string;
  display_name: string;
  game_id: string;
  game_name: string;
  is_live: boolean;
  tags: string[];
  title: string;
  started_at: string;
  thumbnail_url: string;
};

export type TwitchChannelInfo = {
  broadcaster_id: string;
  broadcaster_language: string;
  broadcaster_login: string;
  broadcaster_name: string;
  game_id: string;
  game_name: string;
  title: string;
  tags: string[];
};

type TwitchResponse<T> = {
  data: T[];
  pagination: {
    cursor?: string;
  };
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedToken | undefined;

function getTwitchCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET environment variable',
    );
  }

  return { clientId, clientSecret };
}

async function getAppAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken;
  }

  const { clientId, clientSecret } = getTwitchCredentials();
  const tokenUrl = new URL(twitchOAuthUrl);
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  const response = await fetch(tokenUrl, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Twitch authentication failed with status ${response.status}`);
  }

  const token = (await response.json()) as TwitchTokenResponse;
  cachedToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 0) * 1000,
  };

  return cachedToken;
}

async function twitchRequest<T>(path: string, searchParams: URLSearchParams) {
  const { clientId } = getTwitchCredentials();
  const token = await getAppAccessToken();
  const url = new URL(`${twitchApiBaseUrl}${path}`);
  url.search = searchParams.toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Client-Id': clientId,
    },
    next: { revalidate: 15 },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Twitch API request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export async function getTwitchUserByLogin(login: string) {
  const params = new URLSearchParams({ login });
  const response = await twitchRequest<TwitchResponse<TwitchUser>>('/users', params);
  return response.data[0] ?? null;
}

export async function getTwitchUsersByIds(userIds: string[]) {
  const params = new URLSearchParams();
  userIds.forEach((userId) => params.append('id', userId));

  return twitchRequest<TwitchResponse<TwitchUser>>('/users', params);
}

export async function getTwitchChannelsByIds(broadcasterIds: string[]) {
  const params = new URLSearchParams();
  broadcasterIds.forEach((broadcasterId) => params.append('broadcaster_id', broadcasterId));

  return twitchRequest<TwitchResponse<TwitchChannelInfo>>('/channels', params);
}

export async function exchangeTwitchAuthorizationCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getTwitchCredentials();
  const response = await fetch(twitchOAuthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Twitch OAuth exchange failed with status ${response.status}`);
  }

  return (await response.json()) as TwitchTokenResponse & { refresh_token: string };
}

export async function getTwitchAuthenticatedUser(accessToken: string) {
  const { clientId } = getTwitchCredentials();
  const response = await fetch(`${twitchApiBaseUrl}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitch identity request failed with status ${response.status}`);
  }

  const result = (await response.json()) as TwitchResponse<TwitchUser>;
  const user = result.data[0];
  if (!user) throw new Error("Twitch did not return an authenticated user");
  return user;
}

export async function refreshTwitchAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getTwitchCredentials();
  const response = await fetch(twitchOAuthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Twitch token refresh failed with status ${response.status}`);
  }

  return (await response.json()) as TwitchTokenResponse & { refresh_token: string };
}

export async function getTwitchFollowedChannels(options: {
  accessToken: string;
  userId: string;
  first?: number;
  after?: string;
}) {
  const { clientId } = getTwitchCredentials();
  const params = new URLSearchParams({ user_id: options.userId });
  if (options.first) params.set("first", String(options.first));
  if (options.after) params.set("after", options.after);

  const response = await fetch(`${twitchApiBaseUrl}/channels/followed?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitch followed channels request failed with status ${response.status}`);
  }

  return (await response.json()) as TwitchResponse<TwitchFollowedChannel>;
}

export async function getTwitchFollowedStreams(options: {
  accessToken: string;
  userId: string;
  first?: number;
  after?: string;
}) {
  const { clientId } = getTwitchCredentials();
  const params = new URLSearchParams({ user_id: options.userId });
  if (options.first) params.set("first", String(options.first));
  if (options.after) params.set("after", options.after);

  const response = await fetch(`${twitchApiBaseUrl}/streams/followed?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitch followed streams request failed with status ${response.status}`);
  }

  return (await response.json()) as TwitchResponse<TwitchStream>;
}

export async function getTwitchStreams(options: {
  first?: number;
  language?: string;
  gameId?: string;
  gameIds?: string[];
  userIds?: string[];
  after?: string;
}) {
  const params = new URLSearchParams();
  if (options.first) params.set("first", String(options.first));
  if (options.language) params.set("language", options.language);
  if (options.gameId) params.set("game_id", options.gameId);
  options.gameIds?.forEach((gameId) => params.append("game_id", gameId));
  options.userIds?.forEach((userId) => params.append("user_id", userId));
  if (options.after) params.set("after", options.after);

  return twitchRequest<TwitchResponse<TwitchStream>>('/streams', params);
}

export async function getTwitchTopGames(first = 10) {
  const params = new URLSearchParams({ first: String(first) });
  return twitchRequest<TwitchResponse<TwitchGame>>('/games/top', params);
}

export async function searchTwitchChannels(options: {
  query: string;
  first?: number;
  after?: string;
  liveOnly?: boolean;
}) {
  const params = new URLSearchParams({ query: options.query });
  if (options.first) params.set('first', String(options.first));
  if (options.after) params.set('after', options.after);
  if (options.liveOnly) params.set('live_only', 'true');

  return twitchRequest<TwitchResponse<TwitchChannel>>('/search/channels', params);
}

export async function searchTwitchCategories(options: {
  query: string;
  first?: number;
  after?: string;
}) {
  const params = new URLSearchParams({ query: options.query });
  if (options.first) params.set('first', String(options.first));
  if (options.after) params.set('after', options.after);

  return twitchRequest<TwitchResponse<TwitchCategory>>('/search/categories', params);
}

export async function getTwitchVideos(options: {
  userId?: string;
  gameId?: string;
  language?: string;
  period?: 'all' | 'day' | 'week' | 'month';
  sort?: 'time' | 'trending' | 'views';
  type?: 'all' | 'archive' | 'highlight' | 'upload';
  first?: number;
  after?: string;
}) {
  const params = new URLSearchParams();

  if (options.userId) params.set('user_id', options.userId);
  if (options.gameId) params.set('game_id', options.gameId);
  if (options.language) params.set('language', options.language);
  if (options.period) params.set('period', options.period);
  if (options.sort) params.set('sort', options.sort);
  if (options.type) params.set('type', options.type);
  if (options.first) params.set('first', String(options.first));
  if (options.after) params.set('after', options.after);

  return twitchRequest<TwitchResponse<TwitchVideo>>('/videos', params);
}