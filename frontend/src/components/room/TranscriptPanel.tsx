import { TranscriptView } from "@/components/transcript/TranscriptView";
import type { TranscriptSegment } from "@/lib/types";
import { SidePanel } from "./SidePanel";

interface TranscriptPanelProps {
  title: string;
  segments: TranscriptSegment[];
  captionsEnabled: boolean;
  onClose: () => void;
}

export function TranscriptPanel({ title, segments, captionsEnabled, onClose }: TranscriptPanelProps) {
  return (
    <SidePanel title="Transcript" onClose={onClose}>
      <TranscriptView
        title={title}
        segments={segments}
        className="px-4 pb-4"
        emptyText={captionsEnabled ? "Waiting for someone to speak…" : "Turn on captions to start the transcript."}
      />
    </SidePanel>
  );
}
