"use client"

import{
    Carousel,
    CarouselApi, 
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { badgeVariants } from "./ui/badge";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface FilterCarouselProps {
	value?: string | null
	isLoading?: boolean
	onSelect: (value: string | null) => void
	onPrefetch?: (value: string) => void
	data: { value: string; label: string }[]
}

export const FilterCarousel = ({
    value, 
    onSelect,
    onPrefetch,
    data, 
    isLoading,
}: FilterCarouselProps) => {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!api){
            return;
        }

        setCount(api.scrollSnapList().length);
        setCurrent(api.selectedScrollSnap() + 1);

        api.on("select", ()=> {
            setCurrent(api.selectedScrollSnap()+1);
        })
    }, [api])
      return (
        <div className="relative w-full">
            {/* Left Fade */}
            <div
                className={cn(
                    "absolute left-12 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-white to-transparent pointer-events-none",
                    false && "hidden",
                    current === 1 && "hidden"
                )}
            />
            <Carousel 
            setApi={setApi}
            opts={{
                align: "start", 
                dragFree: true,
            }}
            className="w-full px-12"
            >
                <CarouselContent className="-ml-3">
                    {!isLoading && (
                        <CarouselItem 
                        className = "pl-3 basis-auto">
                            <button
                                type="button"
                                onClick={() => onSelect(null)}
                                className={cn(
                                    badgeVariants({ variant: !value ? "default" : "secondary" }),
                                    "rounded-lg px-3 py-1 whitespace-nowrap text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                )}
                            >
                                All
                            </button>
                        </CarouselItem> 
                    )}
                    {isLoading && 
                        Array.from({ length: 14}).map((_, index) =>(
                            <CarouselItem key={index} className="pl-3 basis-auto">
                                <Skeleton className="rounded-lg bg-secondary px-3 py-1 h-full text-sm w-[100px] font-semibold">
                                    &nbsp;
                                </Skeleton>
                            </CarouselItem>
                        ))
                    }
                    {!isLoading && data.map((item) => (
                        <CarouselItem key={item.value} 
                        className="pl-3 basis-auto">
                            <button
                                type="button"
                                onClick={() => onSelect(item.value)}
                                onMouseEnter={() => onPrefetch?.(item.value)}
                                onFocus={() => onPrefetch?.(item.value)}
                                className={cn(
                                    badgeVariants({ variant: value === item.value ? "default" : "secondary" }),
                                    "rounded-lg px-3 py-1 whitespace-nowrap text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                )}
                            >
                                {item.label}
                            </button>
                        </CarouselItem>
                    ))}
                </CarouselContent>
                <CarouselPrevious className="left-0 z-20"/> 
                <CarouselNext className="right-0 z-20"/>
            </Carousel>
            {/* Right Fade */}
            <div
                className={cn(
                    "absolute right-12 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-white to-transparent pointer-events-none",
                    current === count && "hidden"
                )}
            />
        </div>
      )
}