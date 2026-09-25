"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomLogo } from "@/components/ui/ZoomLogo";
import { useSignedIn } from "@/hooks/useAuth";
import { useLocalPreview } from "@/hooks/useLocalPreview";
import { useMe } from "@/hooks/useMeetings";
import { useSettings } from "@/hooks/useSettings";
import { ApiError, api } from "@/lib/api";
import type { EndReason } from "@/lib/rtc/room-client";
import type { JoinResponse, MeetingLookup } from "@/lib/types";
import { MeetingRoom } from "./MeetingRoom";
import { PreJoin } from "./PreJoin";
import { MeetingEnded, MeetingNotFound, WaitingForHost } from "./StatusScreens";

export interface MeetingFlowProps {
  code: string;
  /** From the invite link (?pwd=). */
  passcode: string | null;
  /** Host start token (?st=), present when the host starts the meeting from the dashboard. */
  startToken: string | null;
  /** Set by the dashboard's join controls (?name=). Absent on an invite link. */
  name: string | null;
  audio: boolean | null;
  video: boolean | null;
  /** Start screen sharing right after joining (dashboard "Share screen" tile). */
  share: boolean;
}

type Stage =
  | { kind: "loading" }
  | { kind: "not-found"; message: string }
  | { kind: "prejoin" }
  | { kind: "waiting" }
  | { kind: "room"; join: JoinResponse; stream: MediaStream | null; audio: boolean; video: boolean }
  | { kind: "ended"; reason: EndReason };

const WAITING_POLL_MS = 4000;

/**
 * The join state machine:  loading -> prejoin -> (waiting for host) -> room -> ended.
 * "Rejoin" remounts the whole flow (new key) so the camera preview starts fresh.
 */
export function MeetingFlow(props: MeetingFlowProps) {
  const [attempt, setAttempt] = useState(0);
  // Render on the client only: the flow depends on localStorage settings and media devices.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Shell><Spinner /></Shell>;
  return <MeetingFlowInner key={attempt} {...props} onRejoin={() => setAttempt((a) => a + 1)} />;
}

function MeetingFlowInner({ code, passcode: linkPasscode, startToken, name: linkName, audio, video, share, onRejoin }: MeetingFlowProps & { onRejoin: () => void }) {
  const router = useRouter();
  const { data: me } = useMe();
  const signedIn = useSignedIn();
  const [settings, updateSettings] = useSettings();
  const preview = useLocalPreview({ audio: audio ?? !settings.muteOnJoin, video: video ?? settings.startWithVideo });

  // Someone who opened an invite link joins as a guest, as in Zoom: without signing in they are
  // only nominally the demo user, so its name is never offered to them - just the name they
  // used as a guest before on this browser. The host (?st=), a signed-in user and the
  // dashboard's join controls (?name=) join with the account's name.
  const isGuest = !startToken && !signedIn && linkName === null;
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [meeting, setMeeting] = useState<MeetingLookup | null>(null);
  const [name, setName] = useState(linkName ?? (isGuest ? settings.guestName : settings.displayName));
  const prefilled = useRef(isGuest || !!name);
  const [remember, setRemember] = useState(true);
  const [passcode, setPasscode] = useState(linkPasscode ?? "");
  const [passcodeRejected, setPasscodeRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);

  // Fill in the account's name once it has loaded. Only once: clearing the field must leave it empty.
  useEffect(() => {
    if (prefilled.current || !me) return;
    prefilled.current = true;
    setName((current) => current || me.full_name);
  }, [me]);

  useEffect(() => {
    api
      .lookup(code)
      .then((m) => {
        setMeeting(m);
        setStage({ kind: "prejoin" });
      })
      .catch((err: Error) => setStage({ kind: "not-found", message: err.message }));
  }, [code]);

  const attemptJoin = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setError(null);
    try {
      const res = await api.join(code, { display_name: name.trim(), passcode: passcode || null, start_token: startToken });
      if (remember) updateSettings(isGuest ? { guestName: name.trim() } : { displayName: name.trim() });
      setStage({
        kind: "room",
        join: res,
        stream: preview.takeStream(),
        audio: preview.audioOn && !res.mute_on_entry,
        video: preview.videoOn && res.video_on_entry,
      });
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "WAITING_FOR_HOST") {
        setStage({ kind: "waiting" });
      } else {
        if (e.code === "INVALID_PASSCODE" || e.code === "PASSCODE_REQUIRED") setPasscodeRejected(true);
        setError(e.message);
        setStage({ kind: "prejoin" });
      }
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [code, name, passcode, startToken, remember, isGuest, updateSettings, preview]);

  // While waiting for the host, keep retrying the join.
  useEffect(() => {
    if (stage.kind !== "waiting") return;
    const id = setInterval(() => void attemptJoin(), WAITING_POLL_MS);
    return () => clearInterval(id);
  }, [stage.kind, attemptJoin]);

  const onExit = useCallback((reason: EndReason) => setStage({ kind: "ended", reason }), []);

  if (stage.kind === "room") {
    return (
      <MeetingRoom join={stage.join} initialStream={stage.stream} audio={stage.audio} video={stage.video} startShare={share} onExit={onExit} />
    );
  }

  return (
    <Shell>
      {stage.kind === "loading" && <Spinner />}
      {stage.kind === "not-found" && <MeetingNotFound message={stage.message} />}
      {stage.kind === "waiting" && meeting && <WaitingForHost meeting={meeting} onLeave={() => router.push("/")} />}
      {stage.kind === "ended" && <MeetingEnded reason={stage.reason} onRejoin={onRejoin} />}
      {stage.kind === "prejoin" && meeting && (
        <PreJoin
          meeting={meeting}
          isHost={!!startToken}
          stream={preview.stream}
          audioOn={preview.audioOn}
          videoOn={preview.videoOn}
          onToggleAudio={() => preview.setAudioOn(!preview.audioOn)}
          onToggleVideo={() => preview.setVideoOn(!preview.videoOn)}
          micDenied={preview.micState === "denied"}
          camDenied={preview.camState === "denied"}
          name={name}
          onNameChange={setName}
          remember={remember}
          onRememberChange={setRemember}
          showPasscode={meeting.requires_passcode && !startToken && (!linkPasscode || passcodeRejected)}
          passcode={passcode}
          onPasscodeChange={setPasscode}
          error={error}
          joining={joining}
          onJoin={() => void attemptJoin()}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center border-b border-line px-5">
        <Link href="/" aria-label="Home">
          <ZoomLogo />
        </Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-zoom-blue" />
    </div>
  );
}
