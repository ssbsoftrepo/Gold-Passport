"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/ui";
import { homeFor, useSession } from "@/lib/session";

/** Sends each user to their home: back office, plant portal, onboarding or login. */
export default function Home() {
  const { status, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    if (status === "authenticated") router.replace(homeFor(user));
  }, [status, user, router]);

  return (
    <main className="main">
      <Loading />
    </main>
  );
}
