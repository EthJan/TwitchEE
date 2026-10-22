import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

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
    const configuredParent = process.env.TWITCH_EMBED_PARENT;
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
    const parent = configuredParent ?? host.split(":")[0];
    const embedParams = new URLSearchParams({ parent });

    if (type === "stream") {
        embedParams.set("channel", id);
    } else {
        embedParams.set("video", id);
    }

    const embedUrl = `https://player.twitch.tv/?${embedParams.toString()}`;
    const title = type === "stream" ? `Watching ${id}` : "Watching Twitch video";

    return (
        <section className="min-h-[calc(100vh-4rem)] bg-white px-4 py-6 text-slate-950">
            <div className="mx-auto max-w-[1500px]">
                <Link className="mb-5 inline-flex text-sm font-medium text-slate-600 hover:text-slate-950" href="/">
                    Back to home
                </Link>
                <div className="overflow-hidden border border-slate-200 bg-black shadow-sm">
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
                <h1 className="mt-5 text-xl font-semibold">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">Playing through the Twitch embedded player.</p>
            </div>
        </section>
    );
}