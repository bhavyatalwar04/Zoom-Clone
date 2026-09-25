"use client";

import clsx from "clsx";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldError, FieldLabel, Input } from "@/components/ui/Field";
import { useSettings } from "@/hooks/useSettings";
import { formatDayLabel, formatMeetingId, formatTime } from "@/lib/format";
import type { MeetingLookup } from "@/lib/types";

interface PreJoinProps {
  meeting: MeetingLookup;
  isHost: boolean;
  stream: MediaStream | null;
  audioOn: boolean;
  videoOn: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  micDenied: boolean;
  camDenied: boolean;
  name: string;
  onNameChange: (v: string) => void;
  remember: boolean;
  onRememberChange: (v: boolean) => void;
  showPasscode: boolean;
  passcode: string;
  onPasscodeChange: (v: string) => void;
  error: string | null;
  joining: boolean;
  onJoin: () => void;
}

function RoundToggle({ on, onClick, onIcon, offIcon, label }: { on: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={clsx(
        "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
        on ? "bg-white/15 text-white hover:bg-white/25" : "bg-zoom-red text-white hover:bg-zoom-red-hover",
      )}
    >
      {on ? onIcon : offIcon}
    </button>
  );
}

export function PreJoin(props: PreJoinProps) {
  const { meeting, stream, videoOn } = props;
  const [settings] = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = videoOn && !!stream?.getVideoTracks().length;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    props.onJoin();
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 md:grid-cols-[1fr_340px] md:items-center md:py-16">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-room">
        <video ref={videoRef} autoPlay playsInline muted className={clsx("h-full w-full object-cover", settings.mirrorVideo && "mirror", !hasVideo && "invisible")} />
        {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <span className="truncate text-2xl font-bold text-white sm:text-3xl">{props.name || "Your name"}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
          <RoundToggle
            on={props.audioOn}
            onClick={props.onToggleAudio}
            onIcon={<Mic className="h-5 w-5" />}
            offIcon={<MicOff className="h-5 w-5" />}
            label={props.audioOn ? "Mute" : "Unmute"}
          />
          <RoundToggle
            on={props.videoOn}
            onClick={props.onToggleVideo}
            onIcon={<Video className="h-5 w-5" />}
            offIcon={<VideoOff className="h-5 w-5" />}
            label={props.videoOn ? "Stop video" : "Start video"}
          />
        </div>
        {(props.micDenied || props.camDenied) && (
          <p className="absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-black/70 px-3 py-1 text-xs text-white">
            {props.camDenied && props.micDenied ? "Camera and microphone are" : props.camDenied ? "Camera is" : "Microphone is"} unavailable or blocked
          </p>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col">
        <h1 className="text-2xl font-bold text-ink">{meeting.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Meeting ID {formatMeetingId(meeting.code)} · Host: {meeting.host_name}
        </p>
        {meeting.scheduled_start && meeting.status !== "live" && (
          <p className="mt-0.5 text-sm text-muted">
            Scheduled {formatDayLabel(meeting.scheduled_start)}, {formatTime(meeting.scheduled_start)}
          </p>
        )}
        {meeting.status === "live" && <p className="mt-2 text-sm font-bold text-zoom-green">Meeting in progress</p>}

        <div className="mt-6 space-y-4">
          <div>
            <FieldLabel htmlFor="display-name">Your Name</FieldLabel>
            <Input id="display-name" value={props.name} maxLength={80} onChange={(e) => props.onNameChange(e.target.value)} autoFocus={!props.name} />
          </div>
          {props.showPasscode && (
            <div>
              <FieldLabel htmlFor="passcode">Meeting Passcode</FieldLabel>
              <Input
                id="passcode"
                type="password"
                value={props.passcode}
                onChange={(e) => props.onPasscodeChange(e.target.value)}
                autoFocus={!!props.name}
                invalid={!!props.error}
              />
            </div>
          )}
          <Checkbox checked={props.remember} onChange={props.onRememberChange} label="Remember my name for future meetings" />
        </div>
        <FieldError>{props.error}</FieldError>

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={!props.name.trim() || (props.showPasscode && !props.passcode)} loading={props.joining}>
          {props.isHost ? "Start" : "Join"}
        </Button>
      </form>
    </div>
  );
}
