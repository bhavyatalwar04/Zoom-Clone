import { Pause, Play, Square } from "lucide-react";
import type { RecorderState } from "@/hooks/useMeetingRecorder";
import { formatElapsed } from "@/lib/meeting-time";

interface RecordingIndicatorProps {
  /** My own recording (with controls). */
  mine: RecorderState;
  elapsedMs: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Someone else is recording (everyone sees this, as in Zoom). */
  othersRecording: string[];
}

export function RecordingIndicator({ mine, elapsedMs, onPause, onResume, onStop, othersRecording }: RecordingIndicatorProps) {
  if (mine !== "idle") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white" role="status">
        <span className={mine === "recording" ? "h-2.5 w-2.5 animate-pulse rounded-full bg-zoom-red" : "h-2.5 w-2.5 rounded-full bg-amber-400"} />
        <span>{mine === "recording" ? "Recording…" : "Recording paused"}</span>
        <span className="tabular-nums text-white/70">{formatElapsed(elapsedMs)}</span>
        <button
          onClick={mine === "recording" ? onPause : onResume}
          className="rounded p-0.5 hover:bg-white/15"
          aria-label={mine === "recording" ? "Pause recording" : "Resume recording"}
        >
          {mine === "recording" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button onClick={onStop} className="rounded p-0.5 hover:bg-white/15" aria-label="Stop recording">
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
    );
  }
  if (!othersRecording.length) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white" role="status" title={`Recorded by ${othersRecording.join(", ")}`}>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-zoom-red" /> Recording
    </div>
  );
}
