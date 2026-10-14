import { Button } from "@/components/ui/button"
import { HydrateClient, trpc } from "@/trpc/server";
import Image from "next/image"
import { PageClient } from "./client";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";


export default async function Home() {
  void trpc.hello.prefetch({ text: "Ethan" })
  return (
    <HydrateClient>
      <Suspense fallback={<p>Loading...</p>}>
      <ErrorBoundary fallback={<p>Error...</p>}>
      <PageClient />
      </ErrorBoundary>
      </Suspense>
    </HydrateClient>
  )
}
 