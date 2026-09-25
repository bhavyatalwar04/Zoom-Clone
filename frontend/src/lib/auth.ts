/**
 * Optional sign-in: the session token lives in localStorage and is sent as a bearer token.
 * Without one, the backend treats the visitor as the demo user.
 */

const KEY = "zoom-clone:token";
const listeners = new Set<() => void>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function set(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the session just won't persist
  }
  listeners.forEach((l) => l());
}

/** Signing in or out switches whose meetings every cached list shows, so start from a clean page. */
export function signIn(token: string, redirectTo = "/") {
  set(token);
  window.location.assign(redirectTo);
}

export function signOut() {
  set(null);
  window.location.assign("/");
}

/** Called when the server rejects the token (expired / invalid). */
export function dropExpiredSession() {
  set(null);
}

export function subscribeToAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
