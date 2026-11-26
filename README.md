This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Install the project dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example` and replace the placeholder with your Clerk publishable key. You can find it in the [Clerk Dashboard API Keys](https://dashboard.clerk.com/last-active?path=api-keys). The variable must be named `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

For Twitch API access, add the client ID and client secret from your Twitch developer console to `.env.local`:

```bash
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_REDIRECT_URI=http://localhost:3000/api/twitch/callback
TWITCH_TOKEN_ENCRYPTION_KEY=generate_with_openssl_rand_base64_32
TWITCH_EMBED_PARENT=localhost
```

Generate the token encryption key with `openssl rand -base64 32`. Add your Twitch redirect URL `http://localhost:3000/api/twitch/callback` to the Twitch developer console. The OAuth flow requests the `user:read:follows` scope, stores encrypted Twitch tokens in Postgres, and exposes followed channels through the signed-in user's home page.

After configuring `DATABASE_URL`, sync the schema to the database:

```bash
bunx drizzle-kit push
```

This project currently uses `drizzle-kit push` for schema changes. Use versioned migrations only after establishing a migration baseline for the existing database.

The backend uses Twitch app access tokens for public video queries and user access tokens for followed channels. Videos are available through the `twitch.videos` tRPC procedure. For example, query videos by login with `{ userLogin: "twitch" }`, or by `userId`/`gameId`.

Public stream snapshots are gathered by `/api/data-gather`. The app also refreshes this public snapshot when a Clerk session becomes signed in; this does not require Twitch user credentials. Streams not observed for ten minutes are removed, so ended streams do not remain in recommendations.

After syncing the latest schema, run the user recommendation worker from a Python environment with `requirements.txt` installed:

```bash
python notebooks/run_user_recommendations.py
```

Run the recommender unit tests locally with:

```bash
python -m unittest discover -s notebooks -p 'test_*.py'
```

The `Recommendation tests` GitHub Actions workflow runs these tests on pushes and pull requests.

The scheduled GitHub Actions workflow runs this command every five minutes. It reads user context collected by the app from Postgres and writes user-scoped recommendations back to Postgres; it never receives Twitch tokens. Set `TWITCH_RECOMMENDATION_USER_ID` to process one user, or omit it to process every connected user.

Foreground time on live-stream pages is recorded in short intervals and used to personalize recommendations for 30 days. Signed-in viewers' history is stored with their account and contributes 55% of the two-tower recommendation score; signed-out viewers' history stays in that browser and locally re-ranks public stream recommendations. Guest history does not sync across devices. Longer viewing increases affinity for both that streamer and the stream's category. Video pages and time spent in a background tab are not counted.

Signed-in users can save channels from live stream cards and revisit them from **Saved channels** in the sidebar. Run `bunx drizzle-kit push` after pulling schema changes to create the saved-channels table.

## GitHub Actions schedule

Vercel Hobby does not support a five-minute Cron schedule, so the [`Refresh Twitch recommendations`](/.github/workflows/recommendations.yml) GitHub Actions workflow handles scheduling instead. It calls the deployed app to refresh public live streams and runs the Python recommendation worker every five minutes. Keep deploying the Next.js app to Vercel; no Vercel Cron is needed.

Add these repository secrets under **Settings > Secrets and variables > Actions**:

- `DATABASE_URL`: the same Neon/Postgres database used by the app.
- `APP_URL`: the deployed base URL, for example `https://twitch-ee.vercel.app`.
- `CRON_SECRET`: the same value configured as an environment variable on Vercel; it authorizes the workflow's request to `/api/data-gather`.

After pushing the workflow to the repository's default branch, enable GitHub Actions if prompted. It will appear under **Actions** and can also be triggered manually with **Run workflow**. Scheduled runs can be delayed during GitHub Actions load; confirm the repository's included Actions minutes are sufficient, especially if it is private.

Manual user-triggered recommendation refresh is currently disabled. The scheduled GitHub Actions workflow continues to run every five minutes.

Live stream and video cards open an in-app viewer using the Twitch embedded player. The viewer derives Twitch's required `parent` parameter from the request hostname, so it works with production domains and Vercel preview URLs without extra configuration. Set `TWITCH_EMBED_PARENT` only if your deployment does not provide a request hostname.

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
