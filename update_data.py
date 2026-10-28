"""Update data/crypto_data.csv dengan harga harian terbaru dari Yahoo Finance.

Cara pakai:
    python update_data.py            # tambahkan data yang belum ada sampai hari ini
    python update_data.py --check    # hanya tampilkan status tanpa mengubah file
"""

import argparse
import csv
import json
import os
import shutil
import sys
from datetime import date, datetime, timedelta, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "data", "crypto_data.csv")

TICKERS = ["BTC-USD", "ETH-USD", "SOL-USD"]
FIELDS = ["Date", "Category", "Ticker", "Open", "High", "Low", "Close", "Volume"]
YAHOO_URL = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    "?period1={start}&period2={end}&interval=1d"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    )
}


def parse_date(value):
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Format tanggal tidak dikenal: {value!r}")


def fetch_yahoo(ticker, start_date, end_date):
    """Ambil OHLCV harian dari Yahoo Finance."""
    period1 = int(datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc).timestamp())
    period2 = int(
        datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).timestamp()
    )
    url = YAHOO_URL.format(ticker=ticker, start=period1, end=period2)
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=30) as resp:
        payload = json.load(resp)

    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        raise RuntimeError(f"Yahoo tidak mengembalikan data untuk {ticker}")
    result = result[0]
    timestamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]

    rows = []
    for i, ts in enumerate(timestamps):
        open_ = (quote.get("open") or [None] * len(timestamps))[i]
        high = (quote.get("high") or [None] * len(timestamps))[i]
        low = (quote.get("low") or [None] * len(timestamps))[i]
        close = (quote.get("close") or [None] * len(timestamps))[i]
        volume = (quote.get("volume") or [None] * len(timestamps))[i]
        if None in (open_, high, low, close):
            continue
        day = datetime.fromtimestamp(ts, tz=timezone.utc).date()
        rows.append(
            {
                "Date": day.isoformat(),
                "Category": "Crypto",
                "Ticker": ticker,
                "Open": float(open_),
                "High": float(high),
                "Low": float(low),
                "Close": float(close),
                "Volume": int(volume) if volume is not None else 0,
            }
        )
    return rows


def read_existing():
    if not os.path.exists(CSV_PATH):
        return {}, []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    by_ticker = {}
    for row in rows:
        row["Date"] = parse_date(row["Date"]).isoformat()
        by_ticker.setdefault(row["Ticker"], []).append(row["Date"])
    return rows, by_ticker


def main():
    parser = argparse.ArgumentParser(description="Update dataset crypto dari Yahoo Finance")
    parser.add_argument("--check", action="store_true", help="cek status tanpa menulis file")
    args = parser.parse_args()

    existing_rows, dates_by_ticker = read_existing()
    if not existing_rows:
        print("Dataset belum ada, ambil data penuh 5 tahun terakhir.")
        start_default = date.today() - timedelta(days=365 * 5)
    else:
        start_default = date.today() - timedelta(days=365 * 2)

    today = date.today()
    new_rows = []
    latest = {}

    for ticker in TICKERS:
        last_dates = dates_by_ticker.get(ticker)
        last_date = parse_date(max(last_dates)) if last_dates else start_default
        latest[ticker] = last_date
        start_date = last_date - timedelta(days=1)  # overlap 1 hari untuk verifikasi
        print(f"{ticker}: data terakhir {last_date}, ambil {start_date} .. {today} ...")
        try:
            fetched = fetch_yahoo(ticker, start_date, today)
        except (URLError, RuntimeError, TimeoutError) as exc:
            print(f"  GAGAL: {exc}", file=sys.stderr)
            return 1
        fresh = [r for r in fetched if parse_date(r["Date"]) > last_date]
        print(f"  {len(fetched)} baris diterima, {len(fresh)} baris baru")
        new_rows.extend(fresh)

    if args.check:
        for ticker in TICKERS:
            print(f"{ticker}: terakhir {latest[ticker]}")
        return 0

    if not new_rows:
        print("Dataset sudah paling baru, tidak ada perubahan.")
        return 0

    backup = os.path.join(
        BASE_DIR, "data", f"crypto_data_backup_{datetime.now():%Y%m%d_%H%M%S}.csv"
    )
    shutil.copy2(CSV_PATH, backup)
    print(f"Backup lama: {os.path.relpath(backup, BASE_DIR)}")

    merged = existing_rows + new_rows
    # Normalisasi tipe + buang duplikat (Ticker, Date)
    unique = {}
    for row in merged:
        unique[(row["Ticker"], row["Date"])] = row
    merged = sorted(unique.values(), key=lambda r: (r["Ticker"], r["Date"]))

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(merged)

    print(f"\nSelesai: {len(existing_rows)} -> {len(merged)} baris (+{len(merged) - len(existing_rows)})")
    for ticker in TICKERS:
        ticker_rows = [r for r in merged if r["Ticker"] == ticker]
        print(
            f"  {ticker}: {len(ticker_rows)} baris, "
            f"{ticker_rows[0]['Date']} .. {ticker_rows[-1]['Date']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
