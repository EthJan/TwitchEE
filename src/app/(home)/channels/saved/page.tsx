"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { trpc } from "@/trpc/client";
import { SaveChannelButton } from "@/modules/home/ui/components/save-channel-button";

const SavedChannelsPage = () => {
    const clerk = useClerk();
    const { isLoaded, isSignedIn } = useAuth();
    const savedChannelsQuery = trpc.twitch.savedChannels.useQuery(undefined, {
        enabled: isSignedIn === true,
    });

    if (!isLoaded) {
        return <p className="p-6 text-sm text-slate-500">Loading saved channels...</p>;
    }

    if (!isSignedIn) {
        return (
            <section className="mx-auto max-w-4xl px-6 py-10">
                <h1 className="text-2xl font-semibold">Saved channels</h1>
                <p className="mt-2 text-sm text-slate-600">Sign in to save and revisit channels.</p>
                <button
                    className="mt-4 bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                    onClick={() => clerk.openSignIn()}
                    type="button"
                >
                    Sign in
                </button>
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-4xl px-6 py-10">
            <h1 className="text-2xl font-semibold">Saved channels</h1>
            <p className="mt-2 text-sm text-slate-600">Channels you want to find again.</p>

            {savedChannelsQuery.isLoading && (
                <p className="mt-6 text-sm text-slate-500">Loading saved channels...</p>
            )}
            {savedChannelsQuery.isError && (
                <p className="mt-6 text-sm text-red-600" role="alert">
                    Could not load saved channels: {savedChannelsQuery.error.message}
                </p>
            )}
            {savedChannelsQuery.data?.length === 0 && (
                <p className="mt-6 border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                    No saved channels yet. Use the Save button on a live stream to add one.
                </p>
            )}
            {savedChannelsQuery.data && savedChannelsQuery.data.length > 0 && (
                <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                    {savedChannelsQuery.data.map((channel) => (
                        <li
                            className="flex items-center justify-between gap-4 py-4"
                            key={channel.broadcasterId}
                        >
                            <a
                                className="min-w-0 hover:text-slate-600"
                                href={`/watch/stream/${encodeURIComponent(channel.login)}`}
                            >
                                <span className="block truncate font-medium">{channel.displayName}</span>
                                <span className="mt-1 block text-sm text-slate-500">@{channel.login}</span>
                            </a>
                            <SaveChannelButton
                                broadcasterId={channel.broadcasterId}
                                login={channel.login}
                                displayName={channel.displayName}
                                className="inline-flex shrink-0 items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
                            />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default SavedChannelsPage;
