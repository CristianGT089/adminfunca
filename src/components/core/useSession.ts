"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import type { Permission } from "@/lib/core/permissions";

export type Session = {
  id: string;
  name: string;
  username: string;
  role: Role;
  roleName: string;
  mustChangePassword: boolean;
  permissions: Permission[];
};

/**
 * The user's session on the client. Without a session it redirects to the login. The
 * permissions it carries decide what to show; the server checks them again on every request.
 */
export function useSession() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.replace("/");
          return;
        }
        setSession(d.user);
      });
  }, [router]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }, [router]);

  const can = useCallback((permission: Permission) => session?.permissions.includes(permission) ?? false, [session]);

  return { session, logout, can };
}

/** JSON fetch returning `{ ok, data }` that sends the user to the login if the session expired. */
export async function request<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  // Expired session: full reload to the login to clear any in-memory state.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/";
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, status: res.status, data };
}
