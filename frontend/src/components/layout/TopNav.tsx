"use client";

import clsx from "clsx";
import { Clock3, Home, MessageCircle, Search, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ZoomLogo } from "@/components/ui/ZoomLogo";
import { ProfileMenu } from "./ProfileMenu";
import { SettingsModal } from "./SettingsModal";

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Team Chat", icon: MessageCircle },
  { href: "/meetings", label: "Meetings", icon: Clock3 },
  { href: "/contacts", label: "Contacts", icon: Users },
];

export function TopNav() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="mx-auto flex h-14 items-center gap-3 px-3 sm:px-5">
        <Link href="/" className="hidden shrink-0 md:block" aria-label="Zoom Workplace home">
          <ZoomLogo />
        </Link>

        <div className="relative hidden w-56 lg:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search"
            className="h-8 w-full rounded-lg bg-surface pl-8 pr-14 text-sm outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-zoom-blue"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">Ctrl+F</kbd>
        </div>

        <nav className="flex flex-1 justify-center gap-1 sm:gap-2" aria-label="Main">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "group flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors sm:min-w-[72px]",
                  active ? "text-zoom-blue" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
                <span className="hidden sm:block">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
          <ProfileMenu onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
