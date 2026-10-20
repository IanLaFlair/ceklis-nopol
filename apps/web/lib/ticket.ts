// Kode tiket cek list dibuat di HP supaya QR tetap bisa diberikan saat offline.
// Format sama dengan server (apps/api/app/services/tickets.py). Bentrok → server membuat kode baru.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newTicketCode(at = new Date()): string {
  const dd = String(at.getDate()).padStart(2, "0");
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const rnd = crypto.getRandomValues(new Uint32Array(5));
  const suffix = Array.from(rnd, (n) => ALPHABET[n % ALPHABET.length]).join("");
  return `CKL-${dd}${mm}-${suffix}`;
}

export const TICKET_RE = /^CKL-\d{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
