import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { WatchSuggestions } from "./suggestions";

interface ViewerPageProps {
    params: Promise<{
        type: string;
        id: string;
    }>;
}

export const dynamic = "force-dynamic";

export default async function ViewerPage({ params }: ViewerPageProps) {
    const { type, id } = await params;
    if (type !== "stream" && type !== "video") notFound();

    const requestHeaders = await headers();
    const requestHost =
        requestHeaders.get("x-forwarded-host")?.split(",")[0].trim() ??
        requestHeaders.get("host") ??
        process.env.VERCEL_URL;
    const parent = requestHost
        ? new URL(`http://${requestHost}`).hostname
        : process.env.TWITCH_EMBED_PARENT ?? "localhost";
    const embedParams = new URLSearchParams({ parent });

    if (type === "stream") {
        embedParams.set("channel", id);
    } else {
        embedParams.set("video", id);
    }

    const embedUrl = `https://player.twitch.tv/?${embedParams.toString()}`;
    const chatUrl = type === "stream"
        ? `https://www.twitch.tv/embed/${encodeURIComponent(id)}/chat?${new URLSearchParams({ parent }).toString()}`
        : null;
    const title = type === "stream" ? `Watching ${id}` : "Watching Twitch video";

    return (
        <section className="min-h-[calc(100vh-4rem)] bg-white px-3 py-4 text-slate-950 sm:px-4 sm:py-6">
            <div className="mx-auto max-w-[1500px]">
                <Link className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-950 sm:mb-5" href="/">
                    Back to home
                </Link>
                <div className={chatUrl ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : undefined}>
                    <div className="-mx-3 overflow-hidden border border-slate-200 bg-black shadow-sm sm:mx-0">
                        <div className="aspect-video w-full">
                            <iframe
                                allow="autoplay; fullscreen"
                                allowFullScreen
                                className="h-full w-full"
                                title={title}
                                src={embedUrl}
                            />
                        </div>
                    </div>
                    {chatUrl && (
                        <aside className="flex h-[60svh] min-h-72 max-h-[560px] flex-col overflow-hidden border border-slate-200 bg-white shadow-sm lg:h-auto lg:min-h-0">
                            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">Live chat</h2>
                            <iframe
                                className="min-h-0 flex-1"
                                title={`${id} live chat`}
                                src={chatUrl}
                            />
                        </aside>
                    )}
                </div>
                <h1 className="mt-4 text-lg font-semibold sm:mt-5 sm:text-xl">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">Playing through the Twitch embedded player.</p>
                <WatchSuggestions
                    excludeLogin={type === "stream" ? id : undefined}
                />
            </div>
        </section>
    );
}