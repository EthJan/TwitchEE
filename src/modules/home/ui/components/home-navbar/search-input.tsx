"use client";

import { FormEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";

export const SearchInput = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [value, setValue] = useState(searchParams.get("search") ?? "");

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const params = new URLSearchParams(searchParams.toString());
        const search = value.trim().replace(/^@/, "");

        if (search) {
            params.set("search", search);
        } else {
            params.delete("search");
        }

        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    };

    return (
        <form className="flex w-full max-w-[600px]" onSubmit={handleSubmit}>
            <div className="relative w-full">
                <input
                    aria-label="Search Twitch channels"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    type="text"
                    placeholder="Search a Twitch channel"
                    className="w-full pl-4 py-2 pr-12 rounded-l-full border focus:outline-none
                focus:border-blue-500"/>
            </div>
            <button
                type="submit"
                className="px-5 py-2 bg-gray-100 border border-l-0 rounded-r-full hover:bg-gray-200disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <SearchIcon className="size-5" />
            </button>

        </form>
    )
}