"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import type { PollView } from "@/lib/types";

interface PollVoteModalProps {
  poll: PollView | null;
  onClose: () => void;
  onSubmit: (pollId: number, optionIds: number[]) => void;
}

/** The pop-up participants get when the host launches a poll. */
export function PollVoteModal({ poll, onClose, onSubmit }: PollVoteModalProps) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => setSelected([]), [poll?.id]);

  if (!poll) return null;
  const toggle = (id: number) =>
    setSelected((cur) => (poll.allow_multiple ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));

  return (
    <Modal
      open
      onClose={onClose}
      title="Poll"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Later
          </Button>
          <Button
            disabled={!selected.length}
            onClick={() => {
              onSubmit(poll.id, selected);
              onClose();
            }}
          >
            Submit
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-1 text-[15px] font-bold text-ink">{poll.question}</legend>
        <p className="mb-3 text-xs text-muted">
          {poll.allow_multiple ? "Choose one or more answers" : "Choose one answer"}
          {poll.is_anonymous && " · Anonymous"}
        </p>
        <div className="space-y-2">
          {poll.options.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm ring-1 ring-line hover:bg-surface",
                selected.includes(option.id) && "bg-zoom-blue-soft ring-zoom-blue hover:bg-zoom-blue-soft",
              )}
            >
              <input
                type={poll.allow_multiple ? "checkbox" : "radio"}
                name={`poll-${poll.id}`}
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
                className="accent-zoom-blue"
              />
              {option.text}
            </label>
          ))}
        </div>
      </fieldset>
    </Modal>
  );
}
