"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useContacts } from "@/hooks/useMeetings";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email chips input with suggestions from the contact list. */
export function InviteeInput({ value, onChange }: { value: string[]; onChange: (emails: string[]) => void }) {
  const { data: contacts = [] } = useContacts();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return contacts
      .filter((c) => !value.includes(c.email))
      .filter((c) => !q || c.full_name.toLowerCase().includes(q) || c.email.includes(q))
      .slice(0, 5);
  }, [contacts, draft, value]);

  const add = (email: string) => {
    const clean = email.trim().toLowerCase().replace(/[,;]$/, "");
    if (EMAIL_RE.test(clean) && !value.includes(clean)) onChange([...value, clean]);
    setDraft("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", "Tab"].includes(e.key) && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const nameFor = (email: string) => contacts.find((c) => c.email === email)?.full_name ?? email;

  return (
    <div className="relative">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 focus-within:border-zoom-blue focus-within:ring-2 focus-within:ring-zoom-blue/15">
        {value.map((email) => (
          <span key={email} className="flex items-center gap-1 rounded-md bg-zoom-blue-soft py-0.5 pl-2 pr-1 text-xs font-bold text-zoom-blue">
            {nameFor(email)}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== email))} aria-label={`Remove ${email}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (draft.trim()) add(draft);
          }}
          placeholder={value.length ? "" : "Enter a name or email"}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted/80"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg bg-white py-1 shadow-pop ring-1 ring-line">
          {suggestions.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  add(c.email);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface"
              >
                <Avatar name={c.full_name} color={c.avatar_color} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{c.full_name}</span>
                  <span className="block truncate text-xs text-muted">{c.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
