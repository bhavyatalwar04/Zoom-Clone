"use client";

import clsx from "clsx";
import { format } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { isModerator, type PeerInfo } from "@/lib/rtc/room-client";
import type { ChatMessage } from "@/lib/types";
import { SidePanel } from "./SidePanel";

interface ChatPanelProps {
  messages: ChatMessage[];
  self: PeerInfo;
  peers: PeerInfo[];
  /** The Security menu's "Allow participants to chat". */
  chatAllowed: boolean;
  onSend: (text: string, to: number | null) => void;
  onClose: () => void;
}

function describe(m: ChatMessage, selfId: number) {
  const from = m.participant_id === selfId ? "Me" : m.sender_name;
  if (m.recipient_id === null) return { from, to: "Everyone", direct: false };
  return { from, to: m.recipient_id === selfId ? "Me" : (m.recipient_name ?? "someone"), direct: true };
}

export function ChatPanel({ messages, self, peers, chatAllowed, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [to, setTo] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const moderator = isModerator(self);
  const canChatEveryone = chatAllowed || moderator;
  // With chat disabled, participants may still message the host / co-hosts privately.
  const recipients = canChatEveryone ? peers : peers.filter(isModerator);
  const target = to === null ? null : (recipients.find((p) => p.id === to) ?? null);
  const effectiveTo = target ? target.id : canChatEveryone ? null : (recipients[0]?.id ?? null);
  const canSend = canChatEveryone || effectiveTo !== null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    if (!draft.trim() || !canSend) return;
    onSend(draft, effectiveTo);
    setDraft("");
  };

  return (
    <SidePanel
      title="Meeting Chat"
      onClose={onClose}
      footer={
        <div className="rounded-lg ring-1 ring-line focus-within:ring-zoom-blue">
          <div className="flex items-center gap-1.5 px-3 pt-2 text-xs text-muted">
            <label htmlFor="chat-to">To:</label>
            <select
              id="chat-to"
              value={effectiveTo ?? "everyone"}
              onChange={(e) => setTo(e.target.value === "everyone" ? null : Number(e.target.value))}
              className="max-w-[200px] cursor-pointer truncate rounded bg-zoom-blue-soft px-1.5 py-px font-bold text-zoom-blue outline-none"
            >
              {canChatEveryone && <option value="everyone">Everyone</option>}
              {recipients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                  {p.role === "host" ? " (Host)" : p.role === "co_host" ? " (Co-host)" : ""}
                </option>
              ))}
            </select>
            {effectiveTo !== null && <span className="text-zoom-red">(Direct Message)</span>}
          </div>
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
              disabled={!canSend}
              placeholder={canSend ? "Type message here..." : "The host has disabled chat"}
              className="min-h-10 flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted/80"
              aria-label="Chat message"
            />
            <button
              onClick={send}
              disabled={!draft.trim() || !canSend}
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
        {!chatAllowed && (
          <p className="rounded-md bg-surface px-3 py-2 text-xs text-muted">
            The host has disabled chat for participants{moderator ? "" : ". You can still message the host privately"}.
          </p>
        )}
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted">Messages addressed to &quot;Everyone&quot; will appear here.</p>
        )}
        {messages.map((m, i) => {
          const info = describe(m, self.id);
          const prev = messages[i - 1];
          const grouped =
            !!prev && prev.participant_id === m.participant_id && prev.recipient_id === m.recipient_id;
          return (
            <div key={m.id} className={clsx("flex gap-2.5", grouped && "-mt-3")}>
              <div className="w-7 shrink-0">{!grouped && <Avatar name={m.sender_name} size={28} shape="square" />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="text-xs text-muted">
                    <span className="font-bold text-ink">{info.from}</span>
                    <span className="ml-1">to {info.to}</span>
                    {info.direct && <span className="ml-1 text-zoom-red">(Direct Message)</span>}
                    <span className="ml-2">{format(new Date(m.sent_at), "h:mm a")}</span>
                  </p>
                )}
                <p className={clsx("mt-0.5 whitespace-pre-wrap break-words text-sm text-ink", info.direct && "rounded bg-red-50 px-2 py-1")}>
                  {m.content}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </SidePanel>
  );
}
