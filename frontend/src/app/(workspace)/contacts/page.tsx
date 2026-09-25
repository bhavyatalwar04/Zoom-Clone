"use client";

import clsx from "clsx";
import { Mail, MessageCircle, Search, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useContacts } from "@/hooks/useMeetings";
import { useStartInstantMeeting } from "@/hooks/useStartMeeting";

export default function ContactsPage() {
  const { data: contacts = [], isLoading } = useContacts();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { start, starting } = useStartInstantMeeting();
  const toast = useToast();

  const filtered = useMemo(
    () => contacts.filter((c) => `${c.full_name} ${c.email}`.toLowerCase().includes(query.toLowerCase())),
    [contacts, query],
  );
  const selected = contacts.find((c) => c.id === selectedId) ?? filtered[0];

  return (
    <div className="flex h-[calc(100dvh-57px)] min-h-0">
      <aside className="flex w-full flex-col border-r border-line md:w-[320px] md:shrink-0">
        <div className="px-4 pb-3 pt-4">
          <h1 className="mb-3 text-lg font-bold">Contacts</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts"
              className="h-9 w-full rounded-lg bg-surface pl-8 pr-3 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-zoom-blue"
            />
          </div>
        </div>
        <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wide text-muted">My contacts ({filtered.length})</p>
        <ul className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
          {isLoading && <li className="px-3 py-4 text-sm text-muted">Loading…</li>}
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                  selected?.id === c.id ? "bg-zoom-blue-soft" : "hover:bg-surface",
                )}
              >
                <Avatar name={c.full_name} color={c.avatar_color} size={36} status="available" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{c.full_name}</span>
                  <span className="block truncate text-xs text-muted">{c.job_title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="hidden flex-1 items-start justify-center overflow-y-auto p-10 md:flex">
        {selected && (
          <div className="flex w-full max-w-md flex-col items-center pt-8 text-center">
            <Avatar name={selected.full_name} color={selected.avatar_color} size={96} />
            <h2 className="mt-4 text-2xl font-bold">{selected.full_name}</h2>
            <p className="text-sm text-muted">{selected.job_title}</p>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" onClick={() => toast.info("Team Chat is not part of this demo.")}>
                <MessageCircle className="h-4 w-4" /> Chat
              </Button>
              <Button onClick={() => start()} loading={starting}>
                <Video className="h-4 w-4" /> Meet
              </Button>
            </div>
            <dl className="mt-8 w-full divide-y divide-line border-y border-line text-left text-sm">
              <div className="flex items-center gap-3 py-3">
                <Mail className="h-4 w-4 text-muted" />
                <a href={`mailto:${selected.email}`} className="text-zoom-blue hover:underline">
                  {selected.email}
                </a>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-muted">Local time</span>
                <span>
                  {new Intl.DateTimeFormat("en-US", { timeZone: selected.timezone, hour: "numeric", minute: "2-digit" }).format(new Date())}
                </span>
              </div>
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
