import re
import secrets
from datetime import datetime

# Tanpa 0/O/1/I/L supaya mudah dibaca dan diketik ulang
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
TICKET_RE = re.compile(rf"^CKL-\d{{4}}-[{ALPHABET}]{{5}}$")


def new_ticket_code(at: datetime) -> str:
    """Kode tiket cek list: CKL-DDMM-XXXXX. Dibuat juga di HP (offline) dengan format yang sama."""
    suffix = "".join(secrets.choice(ALPHABET) for _ in range(5))
    return f"CKL-{at:%d%m}-{suffix}"


def is_valid_ticket(code: str) -> bool:
    return bool(TICKET_RE.match(code))
