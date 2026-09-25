"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldError, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useMe } from "@/hooks/useMeetings";
import { useSettings } from "@/hooks/useSettings";
import { ApiError, api } from "@/lib/api";
import { parseMeetingInput } from "@/lib/format";

interface JoinMeetingModalProps {
  open: boolean;
  onClose: () => void;
  /** "share" is the Share Screen tile: same flow, but starts screen sharing after joining. */
  mode?: "join" | "share";
}

export function JoinMeetingModal({ open, onClose, mode = "join" }: JoinMeetingModalProps) {
  const router = useRouter();
  const { data: me } = useMe();
  const [settings, updateSettings] = useSettings();
  const [meetingInput, setMeetingInput] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const [noAudio, setNoAudio] = useState(false);
  const [noVideo, setNoVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMeetingInput("");
    setError(null);
    setName(settings.displayName || me?.full_name || "");
    setNoAudio(settings.muteOnJoin);
    setNoVideo(!settings.startWithVideo);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { code, passcode } = parseMeetingInput(meetingInput);
  const canJoin = code.length >= 9 && name.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canJoin) return;
    setChecking(true);
    setError(null);
    try {
      await api.lookup(code); // validate the meeting exists before leaving the dashboard
      if (remember) updateSettings({ displayName: name.trim() });
      const params = new URLSearchParams({ name: name.trim(), audio: noAudio ? "0" : "1", video: noVideo ? "0" : "1" });
      if (passcode) params.set("pwd", passcode);
      if (mode === "share") params.set("share", "1");
      router.push(`/j/${code}?${params}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Invalid meeting ID. Please check and try again." : (err as Error).message);
      setChecking(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === "share" ? "Share screen" : "Join meeting"}>
      <form onSubmit={submit} className="space-y-3 pt-1">
        <div>
          <Input
            autoFocus
            value={meetingInput}
            onChange={(e) => {
              setMeetingInput(e.target.value);
              setError(null);
            }}
            placeholder={mode === "share" ? "Sharing key or meeting ID" : "Meeting ID or personal link name"}
            invalid={!!error}
            aria-label="Meeting ID"
          />
          <FieldError>{error}</FieldError>
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} />
        <div className="space-y-2.5 pt-1">
          <Checkbox checked={remember} onChange={setRemember} label="Remember my name for future meetings" />
          <Checkbox checked={noAudio} onChange={setNoAudio} label="Don't connect to audio" />
          <Checkbox checked={noVideo} onChange={setNoVideo} label="Turn off my video" />
        </div>
        <p className="pt-1 text-xs leading-relaxed text-muted">
          By clicking &quot;Join&quot;, you agree to our Terms of Service and Privacy Statement.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canJoin} loading={checking}>
            {mode === "share" ? "Share" : "Join"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
