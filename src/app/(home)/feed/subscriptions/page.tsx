import { PageClient as TwitchHome } from "@/app/(home)/client";

export const dynamic = "force-dynamic";

export default function SubscriptionsPage() {
    return <TwitchHome subscriptions />;
}