import { Suspense } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchInput } from "./search-input";
import { AuthButton } from "@/modules/auth/ui/components/auth-button";
import { BrandLink } from "./brand-link";

export const HomeNavBar = () => {
    return (
        <nav className="fixed top-0 left-0 right-0 h-16 bg-white flex items-center px-2 pr-5 z-50">
            <div className="flex items-center gap-4 w-full">
                {/* Menu Button */}
                <div className="flex items-center flex-shrink-0">
                    <SidebarTrigger />
                    <BrandLink />
                </div>

                {/*search bar */}
                <div className="flex-1 flex justify-center max-w-[720px] mx-auto">
                    <Suspense fallback={<div className="h-10 w-full max-w-[600px]" aria-hidden="true" />}>
                        <SearchInput />
                    </Suspense>

                </div>
                <div className="flex-shrink-0 items-center flex gap-4">
                    <AuthButton />

                </div>

            </div>
        </nav>

    );
};
