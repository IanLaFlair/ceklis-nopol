"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { api } from "@/lib/api/client";
import type { ActiveItem } from "@/lib/petugas/data";
import type { TxDetail } from "@/lib/types";
import { QrScanner } from "./qr-scanner";

/** Scan QR tiket cek list → buka check out. Offline: cari di daftar kendaraan aktif yang tersimpan. */
export function useQrCheckout(items: ActiveItem[]) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onResult = useCallback(
    async (raw: string) => {
      setScanning(false);
      const code = raw.split("/").pop()!.toUpperCase();
      const local = items.find((i) => i.ticket_code === code);
      if (local) return router.push(`/checkout/${local.client_id}`);
      try {
        const tx = await api<TxDetail>(`/tickets/${encodeURIComponent(code)}`);
        if (tx.status !== "parked") setError(`Tiket ${code} sudah diproses check out.`);
        else router.push(`/checkout/${tx.client_id}`);
      } catch (e) {
        setError((e as Error).message || `Tiket ${code} tidak ditemukan di pos ini.`);
      }
    },
    [items, router],
  );

  return {
    open: () => {
      setError(null);
      setScanning(true);
    },
    error,
    clearError: () => setError(null),
    scanner: scanning ? <QrScanner onResult={onResult} onClose={() => setScanning(false)} /> : null,
  };
}
