"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input } from "@/components/ui/Field";
import { ZoomLogo } from "@/components/ui/ZoomLogo";
import { ApiError, api } from "@/lib/api";
import { parseMeetingInput } from "@/lib/format";

/** Standalone web join page (like zoom.us/join). */
export default function JoinPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { code, passcode } = parseMeetingInput(value);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 9) return setError("Please enter a valid meeting ID.");
    setChecking(true);
    try {
      await api.lookup(code);
      router.push(`/j/${code}${passcode ? `?pwd=${encodeURIComponent(passcode)}` : ""}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Invalid meeting ID. Please check and try again." : (err as Error).message);
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex h-16 items-center border-b border-line px-6">
        <Link href="/">
          <ZoomLogo product={null} />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pt-20">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-3xl font-bold">Join Meeting</h1>
          <label htmlFor="meeting-id" className="mb-1.5 block text-sm font-bold text-ink-2">
            Meeting ID or Personal Link Name
          </label>
          <Input
            id="meeting-id"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="Enter Meeting ID or Personal Link Name"
            className="h-11"
            invalid={!!error}
          />
          <FieldError>{error}</FieldError>
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={!value.trim()} loading={checking}>
            Join
          </Button>
          <p className="mt-6 text-center text-sm text-muted">
            Want to host instead?{" "}
            <Link href="/" className="font-bold text-zoom-blue hover:underline">
              Go to Home
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
