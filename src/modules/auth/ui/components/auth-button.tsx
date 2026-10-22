"use client";

import { Button } from "@/components/ui/button"
import { UserCircleIcon } from "lucide-react"
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";


export const AuthButton = () => {
    const { isLoaded, isSignedIn } = useAuth();

    if (!isLoaded) {
        return <div aria-hidden className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />;
    }

    if (isSignedIn) {
        return <UserButton />;
    }

    return (
        <SignInButton mode="modal">
            <Button
                variant="outline"
                className="rounded-full border-blue-500/20 px-3 py-2 text-sm font-medium text-blue-600 shadow-none hover:text-blue-500 [&_svg]:size-4"
            >
                <UserCircleIcon />
                Sign in
            </Button>
        </SignInButton>
    );
};