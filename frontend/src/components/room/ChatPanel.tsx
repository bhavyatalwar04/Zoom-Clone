"use client";

import { format } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { ChatMessage } from "@/lib/types";
import { SidePanel } from "./SidePanel";

interface ChatPanelProps {
  messages: ChatMessage[];
  selfId: number;
  onSend: (text: string) => void;
  onClose: () => void;
}

export function ChatPanel({ messages, selfId, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <SidePanel
      title="Meeting Chat"
      onClose={onClose}
      footer={
        <div className="rounded-lg ring-1 ring-line focus-within:ring-zoom-blue">
          <p className="px-3 pt-2 text-xs text-muted">
            To: <span className="rounded bg-zoom-blue-soft px-1.5 py-px font-bold text-zoom-blue">Everyone</span>
          </p>
          <div className="flex items-end gap-2 p-2 pt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Type message here..."
              className="min-h-10 flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted/80"
              aria-label="Chat message"
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="rounded-md p-1.5 text-zoom-blue hover:bg-zoom-blue-soft disabled:text-muted disabled:hover:bg-transparent"
              aria-label="Send message"
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-3">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted">
            Messages addressed to &quot;Everyone&quot; will appear here.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.participant_id === selfId;
          const grouped = i > 0 && messages[i - 1].participant_id === m.participant_id;
          return (
            <div key={m.id} className={`flex gap-2.5 ${grouped ? "-mt-3" : ""}`}>
              <div className="w-7 shrink-0">{!grouped && <Avatar name={m.sender_name} size={28} shape="square" />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="text-xs text-muted">
                    <span className="font-bold text-ink">{mine ? "Me" : m.sender_name}</span>
                    <span className="ml-1">to Everyone</span>
                    <span className="ml-2">{format(new Date(m.sent_at), "h:mm a")}</span>
                  </p>
                )}
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{m.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </SidePanel>
  );
}
