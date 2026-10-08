"""The fake source system: writes pump readings into a local CSV file.

The Cognite DB extractor reads that CSV on a schedule, so everything this module
does shows up in the Integrations monitoring UI a minute or so later.
"""

import csv
import math
import os
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from helpers.constants import CSV_COLUMNS, DATA_DIR, EXTRACTOR_STATE, FEED_CSV, PUMP_IDS

# rows per batch and seconds between batches
PACES = {
    "paused": (0, 0.0),
    "slow": (1, 30.0),
    "normal": (1, 5.0),
    "fast": (5, 1.0),
    "burst": (200, 10.0),
}

# The feed thread and the buttons in the notebook all write the same file.
_csv_lock = threading.RLock()


def _utcnow(offset_seconds: float = 0.0) -> str:
    return datetime.fromtimestamp(
        time.time() - offset_seconds, tz=timezone.utc
    ).isoformat(timespec="milliseconds")


def _write_rows(path: Path, header: list[str], rows: list[list], mode: str) -> None:
    """Write rows, replacing the file atomically when rewriting it wholesale.

    The extractor may read this file at any moment, so a partial file must never be
    visible to it.
    """
    with _csv_lock:
        if mode == "append":
            with open(path, "a", newline="", encoding="utf-8") as handle:
                csv.writer(handle).writerows(rows)
            return

        tmp = path.with_suffix(".csv.tmp")
        with open(tmp, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            writer.writerows(rows)
        os.replace(tmp, path)


def read_all() -> tuple[list[str], list[list[str]]]:
    if not FEED_CSV.exists():
        return list(CSV_COLUMNS), []
    with open(FEED_CSV, newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    if not rows:
        return list(CSV_COLUMNS), []
    return rows[0], rows[1:]


def ensure_csv() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not FEED_CSV.exists():
        _write_rows(FEED_CSV, list(CSV_COLUMNS), [], mode="replace")


def start_blank() -> None:
    """Delete the CSV and the extractor's saved position, so the feed numbers readings from 1 again.

    The extractor only reads rows past the last reading_id it saw, so its saved position has to
    go with the file or it would skip every new row.
    """
    with _csv_lock:
        FEED_CSV.unlink(missing_ok=True)
        EXTRACTOR_STATE.unlink(missing_ok=True)
        ensure_csv()


def next_reading_id() -> int:
    _, rows = read_all()
    ids = [int(r[0]) for r in rows if r and r[0].isdigit()]
    return max(ids) + 1 if ids else 1


def _reading(reading_id: int, pump_id: str, tick: float, age_seconds: float = 0.0) -> list:
    """A plausible-looking reading. Deterministic shape, small random jitter."""
    phase = PUMP_IDS.index(pump_id) * 2.0
    return [
        reading_id,
        _utcnow(age_seconds),
        pump_id,
        round(120 + 15 * math.sin(tick / 30 + phase) + random.uniform(-2, 2), 2),
        round(4.2 + 0.4 * math.sin(tick / 45 + phase) + random.uniform(-0.1, 0.1), 3),
        round(58 + 6 * math.sin(tick / 90 + phase) + random.uniform(-1, 1), 2),
        "OK",
    ]


def append_batch(rows_per_pump: int = 1) -> int:
    """Append `rows_per_pump` readings for every pump. Returns rows written."""
    ensure_csv()
    reading_id = next_reading_id()
    tick = time.time()
    rows = []
    # Datapoints are keyed by timestamp, so readings in the same batch must not
    # share one or they would overwrite each other. A batch is spread backwards
    # over the preceding seconds, ending at now.
    for index in range(rows_per_pump):
        age = float(rows_per_pump - 1 - index)
        for pump_id in PUMP_IDS:
            rows.append(_reading(reading_id, pump_id, tick, age_seconds=age))
            reading_id += 1
    _write_rows(FEED_CSV, list(CSV_COLUMNS), rows, mode="append")
    return len(rows)


# What a sensor writes when it is offline. The extractor decides each column's type from the first
# 100 rows of the file. Once flow_rate has been seen to be numeric, a later value that is not a
# number makes the whole file unreadable for it - not just that row. (A bad date would not do
# this: the extractor treats the timestamp column as plain text.) In a file shorter than 100 rows
# the bad value is inside that sample, so the column simply becomes text and nothing fails.
BAD_VALUE = "N/A"
MIN_ROWS_BEFORE_BAD_DATA = 150


def _is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def inject_bad_data() -> str:
    """Append a reading whose flow_rate is not a number, as if a sensor had reported "N/A".

    The extractor cannot read the file while that row is in it, so its `pump_readings`
    task fails on every cycle, and each failure is reported to the integration. If the file
    is still short, normal readings are added first so that the bad one comes after the
    rows the extractor samples to decide the column's type.
    """
    ensure_csv()
    with _csv_lock:
        existing = len(read_all()[1])
        padding = 0
        if existing < MIN_ROWS_BEFORE_BAD_DATA:
            per_pump = -(-(MIN_ROWS_BEFORE_BAD_DATA - existing) // len(PUMP_IDS))
            padding = append_batch(per_pump)
        reading_id = next_reading_id()
        row = _reading(reading_id, PUMP_IDS[0], time.time())
        row[CSV_COLUMNS.index("flow_rate")] = BAD_VALUE
        row[CSV_COLUMNS.index("status")] = "SENSOR_FAULT"
        _write_rows(FEED_CSV, list(CSV_COLUMNS), [row], mode="append")
    message = f"Added reading {reading_id} with flow_rate = {BAD_VALUE!r}. The extractor cannot read the file until it is removed."
    if padding:
        message = f"The file only had {existing} readings, so {padding} normal ones were added first. " + message
    return message


def remove_bad_data() -> str:
    """Remove every reading the extractor cannot read, so its next cycle succeeds."""
    with _csv_lock:
        header, rows = read_all()
        column = header.index("flow_rate")
        kept = [row for row in rows if len(row) > column and _is_number(row[column])]
        removed = len(rows) - len(kept)
        if removed:
            _write_rows(FEED_CSV, header, kept, mode="replace")
    if not removed:
        return "Nothing to remove: every reading in the file is readable."
    return f"Removed {removed} unreadable reading(s). The extractor recovers on its next cycle."


def status() -> dict:
    _, rows = read_all()
    return {"file": str(FEED_CSV), "exists": FEED_CSV.exists(), "rows": len(rows)}


class FeedRunner:
    """Appends readings on a background thread at the selected pace."""

    def __init__(self, on_event=None):
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._pace = "normal"
        self._lock = threading.Lock()
        self.rows_written = 0
        self.batches = 0
        self._on_event = on_event or (lambda message: None)

    @property
    def pace(self) -> str:
        with self._lock:
            return self._pace

    def set_pace(self, pace: str) -> None:
        if pace not in PACES:
            raise ValueError(f"Unknown pace {pace!r}. One of: {', '.join(PACES)}")
        with self._lock:
            self._pace = pace
        self._on_event(f"pace -> {pace}")

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.running:
            self._on_event("already running")
            return
        ensure_csv()
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._on_event("feed started")

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._thread = None
        self._on_event("feed stopped")

    def _run(self) -> None:
        while not self._stop.is_set():
            rows_per_pump, interval = PACES[self.pace]
            if rows_per_pump == 0:
                self._stop.wait(1.0)
                continue
            written = append_batch(rows_per_pump)
            self.rows_written += written
            self.batches += 1
            self._on_event(f"+{written} rows (total {self.rows_written})")
            self._stop.wait(interval)
