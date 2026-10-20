// v1: link wa.me dengan teks terisi (PRD §4.5). Nomor pemilik opsional.
export function waLink(text: string, phone?: string | null): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function ticketMessage(opts: {
  ticket: string;
  plate: string;
  site: string;
  post: string;
  checkinAt: string;
  summary: string;
}): string {
  // Penamaan wajib "Tiket cek list" — jangan "tiket valet" (permintaan klien, PRD §4.2)
  return [
    `Tiket cek list ${opts.ticket}`,
    `${opts.site} · ${opts.post}`,
    `Masuk: ${opts.checkinAt}`,
    "",
    opts.summary,
    "",
    "Tunjukkan tiket cek list ini saat mengambil kendaraan.",
  ].join("\n");
}
