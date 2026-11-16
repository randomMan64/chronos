"use client";

export const AUTH_BROADCAST_CHANNEL = "chronos_auth_sync";

export interface AuthBroadcastMessage {
  event: "SESSION_REVOKED" | "LOGOUT";
  reason?: string;
  timestamp: number;
}

let isRedirecting = false;
let broadcastChannel: BroadcastChannel | null = null;

/**
 * Initializes the BroadcastChannel for multi-tab synchronization.
 * Never transmits sensitive session tokens or personal data.
 */
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

/**
 * Clears client-side caches, user storage, and local state.
 */
export function clearClientAuthState() {
  if (typeof window === "undefined") return;

  try {
    // Clear user preferences and cached workspace/org state
    const keysToRemove = [
      "chronos_active_org",
      "chronos_active_ws",
      "chronos_sidebar_pref",
      "chronos_timezone",
      "chronos_date_format",
      "chronos_time_format",
      "chronos_language",
    ];
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore local storage errors
  }
}

/**
 * Centrally handles session revocation or logout:
 * - Prevents multiple redirect loops or simultaneous logout operations
 * - Notifies other browser tabs via BroadcastChannel
 * - Clears local state and redirects to login with reason
 */
export function handleSessionRevocation(reason: "SESSION_REVOKED" | "LOGOUT" = "SESSION_REVOKED") {
  if (typeof window === "undefined" || isRedirecting) {
    return;
  }

  isRedirecting = true;
  clearClientAuthState();

  // Notify other tabs on the same browser (no sensitive tokens included)
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      const msg: AuthBroadcastMessage = {
        event: reason,
        reason,
        timestamp: Date.now(),
      };
      channel.postMessage(msg);
    }
  } catch {
    // ignore
  }

  // Prevent redirect loops if already on an auth entry page
  const currentPath = window.location.pathname;
  if (currentPath === "/login" || currentPath === "/register") {
    isRedirecting = false;
    return;
  }

  const destination =
    reason === "SESSION_REVOKED"
      ? "/login?reason=SESSION_REVOKED"
      : "/login";

  window.location.href = destination;
}

/**
 * Global fetch interceptor:
 * - Detects 401 responses with SESSION_REVOKED or unauthorized session
 * - Ignores ordinary 403 Forbidden permission errors (does NOT logout)
 * - Ignores auth entry APIs (/api/v1/auth/login, /api/v1/auth/register)
 */
export function installGlobalAuthInterceptor() {
  if (typeof window === "undefined") return () => {};

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response.status === 401) {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
      const isAuthApi =
        url.includes("/api/v1/auth/login") ||
        url.includes("/api/v1/auth/register") ||
        url.includes("/api/v1/auth/forgot-password") ||
        url.includes("/api/v1/auth/reset-password");

      if (!isAuthApi) {
        handleSessionRevocation("SESSION_REVOKED");
      }
    }

    // Explicit: Do NOT redirect on ordinary 403 Forbidden permission errors
    return response;
  };

  return () => {
    window.fetch = originalFetch;
  };
}

/**
 * Lightweight, non-aggressive session watchdog:
 * - Validates session status only every 60 seconds when active
 * - Pauses completely when tab is hidden
 * - Validates when tab regains focus (throttled to at most once every 15s)
 * - Uses exponential backoff for temporary network failures
 * - Calls only /api/v1/auth/session-status (minimal 1-row lookup, zero joins)
 */
export function startSessionWatchdog(onRevoked?: () => void) {
  if (typeof window === "undefined") return () => {};

  let checkTimer: NodeJS.Timeout | null = null;
  let inFlight = false;
  let lastCheckedTime = 0;
  let backoffMs = 5000;
  const NORMAL_INTERVAL_MS = 60000; // 60 seconds
  const THROTTLE_FOCUS_MS = 15000; // 15 seconds
  const MAX_BACKOFF_MS = 60000;

  async function checkSessionStatus() {
    if (inFlight || isRedirecting) return;
    if (document.visibilityState === "hidden") return;

    inFlight = true;
    try {
      const res = await fetch("/api/v1/auth/session-status", { cache: "no-store" });
      lastCheckedTime = Date.now();
      backoffMs = 5000; // Reset backoff on successful network response

      if (res.status === 401) {
        if (onRevoked) onRevoked();
        handleSessionRevocation("SESSION_REVOKED");
        return;
      }
    } catch {
      // Temporary network error: apply exponential backoff
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    } finally {
      inFlight = false;
      scheduleNextCheck(backoffMs > 5000 ? backoffMs : NORMAL_INTERVAL_MS);
    }
  }

  function scheduleNextCheck(delayMs: number) {
    if (checkTimer) clearTimeout(checkTimer);
    if (document.visibilityState !== "hidden") {
      checkTimer = setTimeout(checkSessionStatus, delayMs);
    }
  }

  // Window Focus / Visibility Change Handler
  function handleVisibilityOrFocus() {
    if (document.visibilityState === "visible") {
      const now = Date.now();
      if (now - lastCheckedTime > THROTTLE_FOCUS_MS) {
        checkSessionStatus();
      } else {
        scheduleNextCheck(NORMAL_INTERVAL_MS);
      }
    } else {
      // Tab is hidden: stop active timers
      if (checkTimer) clearTimeout(checkTimer);
    }
  }

  // Listen to BroadcastChannel for multi-tab synchronization
  const channel = getBroadcastChannel();
  const handleBroadcast = (event: MessageEvent<AuthBroadcastMessage>) => {
    if (event.data?.event === "SESSION_REVOKED" || event.data?.event === "LOGOUT") {
      handleSessionRevocation(event.data.event);
    }
  };

  if (channel) {
    channel.addEventListener("message", handleBroadcast);
  }

  document.addEventListener("visibilitychange", handleVisibilityOrFocus);
  window.addEventListener("focus", handleVisibilityOrFocus);

  // Initial check scheduled after 60s (initial auth happens on page load)
  scheduleNextCheck(NORMAL_INTERVAL_MS);

  return () => {
    if (checkTimer) clearTimeout(checkTimer);
    document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    window.removeEventListener("focus", handleVisibilityOrFocus);
    if (channel) {
      channel.removeEventListener("message", handleBroadcast);
    }
  };
}
