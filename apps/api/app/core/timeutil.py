from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import get_settings


def tz() -> ZoneInfo:
    return ZoneInfo(get_settings().app_tz)


def now() -> datetime:
    return datetime.now(tz())


def day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min, tzinfo=tz())
    return start, start + timedelta(days=1)


def today() -> date:
    return now().date()
