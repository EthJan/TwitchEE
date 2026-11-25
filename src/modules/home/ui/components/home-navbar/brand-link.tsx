"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const logos = [
    "/gemini-svg.svg",
    "/gemini-svg%20(1).svg",
    "/gemini-svg%20(2).svg",
    "/gemini-svg%20(3).svg",
];

export const BrandLink = () => {
    const [logoIndex, setLogoIndex] = useState(0);
    const [previousLogoIndex, setPreviousLogoIndex] = useState<number | null>(null);

    return (
        <Link
            href="/"
            onClick={() => {
                setPreviousLogoIndex(logoIndex);
                setLogoIndex((index) => (index + 1) % logos.length);
            }}
        >
            <div className="p-4 flex items-center gap-1">
                <span className="relative block h-8 w-8 overflow-hidden">
                    {previousLogoIndex !== null && (
                        <Image
                            key={previousLogoIndex}
                            src={logos[previousLogoIndex]}
                            alt=""
                            width={32}
                            height={32}
                            className="brand-logo-exit absolute inset-0 h-full w-full object-contain"
                            onAnimationEnd={() => setPreviousLogoIndex(null)}
                        />
                    )}
                    <Image
                        key={logoIndex}
                        src={logos[logoIndex]}
                        alt=""
                        width={32}
                        height={32}
                        className={`absolute inset-0 h-full w-full object-contain${previousLogoIndex !== null ? " brand-logo-enter" : ""}`}
                    />
                </span>
                <p className="text-xl font-semibold tracking-tight">TwitchEE</p>
            </div>
        </Link>
    );
};
