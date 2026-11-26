"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import Image from "next/image";
import { trpc } from "@/trpc/client";

export const SearchInput = () => {
    const searchParams = useSearchParams();
    const search = searchParams.get("search") ?? "";

    return <SearchForm key={search} initialValue={search} />;
};

const SearchForm = ({ initialValue }: { initialValue: string }) => {
    const router = useRouter();
    const [value, setValue] = useState(initialValue);
    const [debouncedValue, setDebouncedValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedValue(value.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [value]);

    const suggestionsQuery = trpc.twitch.searchSuggestions.useQuery(
        { query: debouncedValue, first: 5 },
        { enabled: isFocused && debouncedValue.length >= 2 },
    );
    const suggestions = suggestionsQuery.data;
    const showSuggestions = isFocused && value.trim().length >= 2;

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const search = value.trim().replace(/^@/, "");

        setIsFocused(false);
        if (search) {
            router.push(`/?${new URLSearchParams({ search }).toString()}`);
        } else {
            router.push("/");
        }
    };

    const selectCreator = (displayName: string, isLive: boolean) => {
        setIsFocused(false);
        const login = encodeURIComponent(displayName.toLowerCase());
        if (isLive) {
            router.push(`/watch/stream/${login}`);
        } else {
            window.location.assign(`https://www.twitch.tv/${login}`);
        }
    };

    const selectCategory = (categoryId: string) => {
        setIsFocused(false);
        router.push(`/?${new URLSearchParams({ categoryId }).toString()}`);
    };

    return (
        <form
            className="relative flex w-full max-w-[600px]"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
            }}
            onSubmit={handleSubmit}
        >
            <div className="relative w-full">
                <input
                    aria-label="Search Twitch creators or categories"
                    aria-autocomplete="list"
                    aria-controls="search-suggestions"
                    aria-expanded={showSuggestions}
                    aria-haspopup="listbox"
                    value={value}
                    onChange={(event) => setValue(event.currentTarget.value)}
                    onFocus={() => setIsFocused(true)}
                    role="combobox"
                    type="text"
                    placeholder="Search creators or categories"
                    className="w-full pl-4 py-2 pr-12 rounded-l-full border focus:outline-none
                focus:border-blue-500"/>
                {showSuggestions && (
                    <div
                        className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-[min(70vh,28rem)] overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-slate-950 shadow-lg"
                        id="search-suggestions"
                        role="listbox"
                    >
                        {(suggestionsQuery.isLoading || debouncedValue !== value.trim()) && (
                            <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
                        )}
                        {suggestionsQuery.isError && (
                            <p className="px-3 py-2 text-sm text-red-600" role="alert">
                                {suggestionsQuery.error.message}
                            </p>
                        )}
                        {suggestions?.categories.length ? (
                            <div>
                                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Categories
                                </p>
                                {suggestions.categories.map((category) => (
                                    <button
                                        aria-label={`Browse ${category.name} category`}
                                        aria-selected={false}
                                        className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                        key={category.id}
                                        onClick={() => selectCategory(category.id)}
                                        onMouseDown={(event) => event.preventDefault()}
                                        role="option"
                                        type="button"
                                    >
                                        <Image
                                            alt=""
                                            className="size-8 rounded-sm object-cover"
                                            height={32}
                                            src={category.box_art_url
                                                .replace(/%?\{width\}/g, "64")
                                                .replace(/%?\{height\}/g, "64")}
                                            width={32}
                                        />
                                        <span>{category.name}</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {suggestions?.channels.length ? (
                            <div className={suggestions.categories.length ? "mt-2 border-t border-slate-100 pt-2" : ""}>
                                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Creators
                                </p>
                                {suggestions.channels.map((channel) => (
                                    <button
                                        aria-label={`Search for ${channel.display_name}`}
                                        aria-selected={false}
                                        className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                        key={channel.id}
                                        onClick={() => selectCreator(channel.display_name, channel.is_live)}
                                        onMouseDown={(event) => event.preventDefault()}
                                        role="option"
                                        type="button"
                                    >
                                        <Image
                                            alt=""
                                            className="size-8 rounded-full object-cover"
                                            height={32}
                                            src={channel.thumbnail_url}
                                            width={32}
                                        />
                                        <span>{channel.display_name}</span>
                                        {channel.is_live && (
                                            <span className="ml-auto rounded-sm bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                                                LIVE
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {!suggestionsQuery.isLoading
                            && !suggestionsQuery.isError
                            && suggestions
                            && suggestions.categories.length === 0
                            && suggestions.channels.length === 0 && (
                                <p className="px-3 py-2 text-sm text-slate-500">No matching creators or categories.</p>
                            )}
                    </div>
                )}
            </div>
            <button
                type="submit"
                aria-label="Search"
                className="rounded-r-full border border-l-0 bg-gray-100 px-3 py-2 hover:bg-gray-200 sm:px-5"
            >
                <SearchIcon className="size-5" />
            </button>

        </form>
    );
};