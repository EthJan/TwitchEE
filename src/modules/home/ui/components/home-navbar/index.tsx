import { Suspense } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchInput } from "./search-input";
import { AuthButton } from "@/modules/auth/ui/components/auth-button";
import { BrandLink } from "./brand-link";

export const HomeNavBar = () => {
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center bg-white px-2 pr-3 sm:pr-5">
            <div className="flex w-full items-center gap-2 sm:gap-4">
                {/* Menu Button */}
                <div className="flex items-center flex-shrink-0">
                    <SidebarTrigger />
                    <BrandLink />
                </div>

                {/*search bar */}
                <div className="min-w-0 flex-1 mx-auto flex max-w-[720px] justify-center">
                    <Suspense fallback={<div className="h-10 w-full max-w-[600px]" aria-hidden="true" />}>
                        <SearchInput />
                    </Suspense>

                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                    <AuthButton />

                </div>

            </div>
        </nav>

    );
};
