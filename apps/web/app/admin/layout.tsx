import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/shell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin Ceklis" } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-zoom">
      <Suspense fallback={<div className="min-h-(--admin-vh) bg-paper" />}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </div>
  );
}
