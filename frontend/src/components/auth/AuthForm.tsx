"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, FieldLabel, Input } from "@/components/ui/Field";
import { ZoomLogo } from "@/components/ui/ZoomLogo";
import { api } from "@/lib/api";
import { signIn } from "@/lib/auth";

/** Zoom-style sign in / sign up page. Signing in is optional; the demo account works without it. */
export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signup && password.length < 8) return setError("Your password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = signup ? await api.signup({ full_name: name, email, password }) : await api.login({ email, password });
      signIn(res.token);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex h-16 items-center justify-between border-b border-line px-6">
        <Link href="/" aria-label="Home">
          <ZoomLogo />
        </Link>
        <Link
          href={signup ? "/signin" : "/signup"}
          className="rounded-lg px-4 py-2 text-sm font-bold text-zoom-blue ring-1 ring-zoom-blue hover:bg-zoom-blue-soft"
        >
          {signup ? "Sign In" : "Sign Up Free"}
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-5 pt-16">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h1 className="text-center text-3xl font-bold text-ink">{signup ? "Create your account" : "Sign In"}</h1>
          {signup && (
            <div>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="h-11" />
            </div>
          )}
          <div>
            <FieldLabel htmlFor="email">Email Address</FieldLabel>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
          </div>
          <div>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11"
            />
            {signup && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || !password || (signup && !name.trim())}>
            {signup ? "Sign Up" : "Sign In"}
          </Button>
          <p className="text-center text-sm text-muted">
            {signup ? "Already have an account? " : "New to Zoom? "}
            <Link href={signup ? "/signin" : "/signup"} className="font-bold text-zoom-blue hover:underline">
              {signup ? "Sign in" : "Sign up free"}
            </Link>
          </p>
          <div className="rounded-lg bg-surface p-3 text-center text-xs text-muted">
            Signing in is optional.{" "}
            <Link href="/" className="font-bold text-zoom-blue hover:underline">
              Continue with the demo account
            </Link>
            {!signup && (
              <span className="mt-1 block">
                Demo logins: bhavya.talwar@example.com or priya.sharma@example.com, password <code>zoom1234</code>
              </span>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
