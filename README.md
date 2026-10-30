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

After configuring `DATABASE_URL`, create and apply the database migration:

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

The backend uses Twitch app access tokens for public video queries and user access tokens for followed channels. Videos are available through the `twitch.videos` tRPC procedure. For example, query videos by login with `{ userLogin: "twitch" }`, or by `userId`/`gameId`.

Live stream and video cards open an in-app viewer using the Twitch embedded player. Set `TWITCH_EMBED_PARENT` to the production hostname when deploying.

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
