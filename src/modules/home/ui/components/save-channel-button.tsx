"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";

interface SaveChannelButtonProps {
    broadcasterId: string;
    login: string;
    displayName: string;
    gameId?: string;
    gameName?: string;
    onPreferenceChange?: (isSaved: boolean) => void;
    className?: string;
}

export const SaveChannelButton = ({
    broadcasterId,
    login,
    displayName,
    gameId,
    gameName,
    onPreferenceChange,
    className,
}: SaveChannelButtonProps) => {
    const clerk = useClerk();
    const { isLoaded, isSignedIn } = useAuth();
    const trpcUtils = trpc.useUtils();
    const savedChannelsQuery = trpc.twitch.savedChannels.useQuery(undefined, {
        enabled: isSignedIn === true,
    });
    const saveChannel = trpc.twitch.saveChannel.useMutation({
        onSuccess: () => {
            void trpcUtils.twitch.savedChannels.invalidate();
            onPreferenceChange?.(true);
        },
        onError: (error) => toast.error(`Could not save channel: ${error.message}`),
    });
    const unsaveChannel = trpc.twitch.unsaveChannel.useMutation({
        onSuccess: () => {
            void trpcUtils.twitch.savedChannels.invalidate();
            onPreferenceChange?.(false);
        },
        onError: (error) => toast.error(`Could not remove saved channel: ${error.message}`),
    });

    const isSaved = savedChannelsQuery.data?.some((channel) => channel.broadcasterId === broadcasterId) ?? false;
    const isPending = saveChannel.isPending || unsaveChannel.isPending;

    const toggleSaved = () => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            clerk.openSignIn();
            return;
        }

        if (isSaved) {
            unsaveChannel.mutate({ broadcasterId });
        } else {
            saveChannel.mutate({ broadcasterId, login, displayName, gameId, gameName });
        }
    };

    return (
        <button
            type="button"
            aria-label={isSaved ? `Remove ${displayName} from saved channels` : `Save ${displayName}`}
            aria-pressed={isSaved}
            className={className}
            disabled={!isLoaded || isPending}
            onClick={toggleSaved}
        >
            {isSaved ? <BookmarkCheck aria-hidden="true" size={16} /> : <Bookmark aria-hidden="true" size={16} />}
            <span>{isSaved ? "Saved" : "Save"}</span>
        </button>
    );
};
