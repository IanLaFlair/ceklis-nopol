import re

_NON_ALNUM = re.compile(r"[^0-9A-Z]")
_PLATE = re.compile(r"^([A-Z]{1,2})(\d{1,4})([A-Z]{0,3})$")


def normalize_plate(raw: str) -> str:
    return _NON_ALNUM.sub("", raw.upper())


def display_plate(raw: str) -> str:
    """'b1234abc' -> 'B 1234 ABC'. Format tak dikenal dikembalikan apa adanya (huruf besar)."""
    norm = normalize_plate(raw)
    m = _PLATE.match(norm)
    if not m:
        return " ".join(raw.upper().split())
    return " ".join(part for part in m.groups() if part)


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("62"):
        digits = "0" + digits[2:]
    return digits
