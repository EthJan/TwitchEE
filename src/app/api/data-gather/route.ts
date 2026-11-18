import { NextResponse } from 'next/server';

import { gatherPublicTwitchSnapshot } from '@/lib/twitch/data-gather';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await gatherPublicTwitchSnapshot());
  } catch (error) {
    console.error('Scheduled Twitch data gather failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Data gather failed' },
      { status: 500 },
    );
  }
}
