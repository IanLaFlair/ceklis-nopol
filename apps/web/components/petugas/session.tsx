"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { cacheGet, cachePut } from "@/lib/offline/db";
import { usePending, useSyncLoop } from "@/lib/offline/hooks";
import { rememberUser } from "@/lib/offline/queue";
import type { MyAssignment, User } from "@/lib/types";

interface Session {
  user: User;
  assignment: MyAssignment;
  /** true kalau data diambil dari cache HP (sinyal jelek / offline) */
  fromCache: boolean;
  pending: ReturnType<typeof usePending>;
  switchPost: (postId: number) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession di luar PetugasSession");
  return s;
}

function storedPost(): number | undefined {
  try {
    const v = localStorage.getItem("ceklis:post");
    return v ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}

export function PetugasSession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [assignment, setAssignment] = useState<MyAssignment | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(
    async (postId?: number) => {
      let me: User | undefined;
      try {
        me = await api<User>("/me");
        await cachePut("session:me", me);
        await rememberUser(me.id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/masuk");
          return;
        }
        me = await cacheGet<User>("session:me");
        if (!me) {
          setFailed("Tidak ada koneksi dan belum pernah masuk di HP ini.");
          return;
        }
        setFromCache(true);
      }
      // Admin tidak memakai aplikasi petugas: langsung ke dashboard
      if (me.role === "super_admin" || me.role === "client_admin") {
        router.replace("/admin");
        return;
      }
      setUser(me);
      const key = `assignment:${me.id}`;
      const q = postId ?? storedPost();
      try {
        const a = await api<MyAssignment>(`/me/assignment${q ? `?post_id=${q}` : ""}`);
        await cachePut(key, a);
        setAssignment(a);
      } catch {
        const cached = await cacheGet<MyAssignment>(key);
        setFromCache(true);
        setAssignment(cached ?? { assignments: [], active: null, template: null, supervisors: [] });
      }
    },
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const pending = usePending(user?.id);
  useSyncLoop(user?.id, pending.total, () => router.replace("/masuk?sesi=habis"));

  const switchPost = useCallback(
    async (postId: number) => {
      try {
        localStorage.setItem("ceklis:post", String(postId));
      } catch {}
      await load(postId);
    },
    [load],
  );

  // Supervisor tanpa pos tugas di aplikasi petugas: arahkan ke dashboard
  const toAdmin = user?.role === "supervisor" && assignment && !assignment.active;
  useEffect(() => {
    if (toAdmin) router.replace("/admin");
  }, [toAdmin, router]);

  if (failed) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-muted">
        <p>{failed}</p>
      </div>
    );
  }
  if (!user || !assignment || toAdmin) {
    return <div aria-busy="true" className="min-h-dvh bg-paper" />;
  }
  return (
    <Ctx.Provider value={{ user, assignment, fromCache, pending, switchPost, reload: () => load() }}>
      {assignment.active ? children : <NoAssignment name={user.name} />}
    </Ctx.Provider>
  );
}

function NoAssignment({ name }: { name: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-3 p-6">
      <h1 className="font-display text-2xl font-bold">Halo, {name}</h1>
      <p className="leading-normal text-muted">
        Kamu belum punya penugasan pos untuk hari ini. Lokasi dan pos tugas diatur oleh admin — hubungi supervisor.
      </p>
      <a href="/akun" className="font-semibold underline">Buka akun</a>
    </div>
  );
}
