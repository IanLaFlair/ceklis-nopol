"use client";

import { PasswordForm } from "@/components/admin/password-form";
import { PageHead, useAdmin } from "@/components/admin/shell";
import { ROLE_LABEL } from "@/lib/format";

/** Akun sendiri (dipakai supervisor yang tidak punya menu Pengaturan). */
export default function AkunPage() {
  const me = useAdmin();
  return (
    <>
      <PageHead title="Akun" sub={`${me.name} · ${ROLE_LABEL[me.role]}${me.email ? ` · ${me.email}` : ""}`} />
      <div className="flex max-w-[520px]">
        <PasswordForm />
      </div>
    </>
  );
}
