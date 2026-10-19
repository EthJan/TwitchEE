import 'server-only';

const twitchApiBaseUrl = 'https://api.twitch.tv/helix';
const twitchOAuthUrl = 'https://id.twitch.tv/oauth2/token';

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
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
    next: { revalidate: 30 },
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