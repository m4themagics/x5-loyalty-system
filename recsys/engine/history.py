"""Признаки истории покупок: покупочные дни, знакомые категории, давность и ритм визитов."""
import datetime as dt
from typing import Any

DAY_MS = 86_400_000


class PurchaseHistory:
    """Считает покупочные дни, а не чеки: два чека одного дня — один покупочный день."""

    def __init__(self, receipts: list[dict[str, Any]], now_ms: int, window_days: int) -> None:
        self.now_ms = now_ms
        self.window_days = window_days
        horizon_ms = now_ms - window_days * DAY_MS
        self.purchase_days: set[str] = set()
        self.category_days: dict[str, set[str]] = {}
        self.category_last_ms: dict[str, int] = {}
        self.day_receipts: dict[str, set[str]] = {}

        for receipt in receipts:
            purchased_at = int(receipt["purchased_at_ms"])
            if purchased_at < horizon_ms or purchased_at > now_ms:
                continue
            paid_lines = [line for line in receipt["lines"] if line["paid"]]
            if not paid_lines:
                continue
            day = day_key(purchased_at)
            self.day_receipts.setdefault(day, set()).add(receipt["receipt_id"])
            if receipt["returned"]:
                continue
            self.purchase_days.add(day)
            for line in paid_lines:
                category = line["category"]
                self.category_days.setdefault(category, set()).add(day)
                self.category_last_ms[category] = max(
                    self.category_last_ms.get(category, 0), purchased_at
                )

    @property
    def purchase_day_count(self) -> int:
        return len(self.purchase_days)

    @property
    def has_history(self) -> bool:
        return bool(self.purchase_days)

    def is_familiar(self, category: str) -> bool:
        return category in self.category_days

    def days_in_category(self, category: str) -> int:
        return len(self.category_days.get(category, ()))

    def days_since_last(self, category: str) -> int | None:
        last_ms = self.category_last_ms.get(category)
        if last_ms is None:
            return None
        return max(0, (self.now_ms - last_ms) // DAY_MS)

    def split_days(self) -> list[str]:
        """Дни, в которых несколько чеков: признак дробления корзины, не самостоятельный запрет."""
        return sorted(day for day, receipts in self.day_receipts.items() if len(receipts) > 1)


def day_key(timestamp_ms: int) -> str:
    return dt.datetime.fromtimestamp(timestamp_ms / 1000, dt.timezone.utc).strftime("%Y-%m-%d")
