"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MeetingFlow } from "@/components/room/MeetingFlow";

function flag(value: string | null): boolean | null {
  if (value === null) return null;
  return value === "1" || value === "true";
}

/** Invite link / meeting room route: /j/84529310472?pwd=abc123 */
function MeetingPage() {
  const { code } = useParams<{ code: string }>();
  const params = useSearchParams();
  return (
    <MeetingFlow
      code={code}
      passcode={params.get("pwd")}
      startToken={params.get("st")}
      name={params.get("name")}
      audio={flag(params.get("audio"))}
      video={flag(params.get("video"))}
      share={params.get("share") === "1"}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MeetingPage />
    </Suspense>
  );
}
