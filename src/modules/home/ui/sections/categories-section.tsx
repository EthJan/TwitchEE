"use client";

import { trpc } from "@/trpc/client";
import { ErrorBoundary } from "react-error-boundary";
import { Suspense } from "react";
import { FilterCarousel } from "@/components/filter-carousel";
import { useRouter } from "next/navigation";

interface CategoriesSectionProps {
    categoryId?: string
}

export const CategoriesSection = ({categoryId}: CategoriesSectionProps) => {
    return (
        <Suspense fallback={<FilterCarousel isLoading data={[]} onSelect={() => {}}/>}>
            <ErrorBoundary fallback={<p>Error...</p>}>
                <CategoriesSectionSuspense categoryId={categoryId} />
            </ErrorBoundary>
        </Suspense>

    )
}



const CategoriesSectionSuspense = ({categoryId}: CategoriesSectionProps) => {
    const router = useRouter();
    const trpcUtils = trpc.useUtils();
    const [categories] = trpc.twitch.topGames.useSuspenseQuery(
        { first: 10 },
        { refetchInterval: 15_000, refetchOnWindowFocus: true },
    );
    
    const data = categories.data.map(({name, id}) => ({
        value: id,
        label:name,
    }))

    const onSelect = (value: string | null) => {
        const url = new URL(window.location.href);

        if (value){
            url.searchParams.set("categoryId", value);

        } else {
            url.searchParams.delete("categoryId");
        }

        router.push(url.toString());

    }

    const onPrefetch = (gameId: string) => {
        void trpcUtils.twitch.popularStreams.prefetch(
            { first: 50, gameId },
            { staleTime: 30_000 },
        );
    }

    return <FilterCarousel onSelect={onSelect} onPrefetch={onPrefetch} value={categoryId} data={data}/>
}