"""
db.py — SQLite database: foydalanuvchi balansi + Click orderlar
"""
import sqlite3
import threading
import time
import os
from typing import Optional

DB_PATH = os.getenv("DB_PATH", "data.db")
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _lock:
        c = _conn()
        c.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                tg_id      INTEGER UNIQUE NOT NULL,
                balance    INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );

            CREATE TABLE IF NOT EXISTS click_orders (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                tg_id          INTEGER NOT NULL,
                amount         INTEGER NOT NULL,
                click_trans_id TEXT,
                status         TEXT NOT NULL DEFAULT 'pending',
                created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
        """)
        c.commit()
        c.close()


# ── Foydalanuvchi ─────────────────────────────────────────────────────────────

def _ensure(tg_id: int) -> None:
    with _lock:
        c = _conn()
        c.execute("INSERT OR IGNORE INTO users (tg_id) VALUES (?)", (tg_id,))
        c.commit()
        c.close()


def get_balance(tg_id: int) -> int:
    _ensure(tg_id)
    c = _conn()
    row = c.execute("SELECT balance FROM users WHERE tg_id=?", (tg_id,)).fetchone()
    c.close()
    return row["balance"] if row else 0


def add_balance(tg_id: int, amount: int) -> None:
    _ensure(tg_id)
    with _lock:
        c = _conn()
        c.execute("UPDATE users SET balance=balance+? WHERE tg_id=?", (amount, tg_id))
        c.commit()
        c.close()


def deduct_balance(tg_id: int, amount: int) -> bool:
    _ensure(tg_id)
    with _lock:
        c = _conn()
        row = c.execute("SELECT balance FROM users WHERE tg_id=?", (tg_id,)).fetchone()
        if not row or row["balance"] < amount:
            c.close()
            return False
        c.execute("UPDATE users SET balance=balance-? WHERE tg_id=?", (amount, tg_id))
        c.commit()
        c.close()
    return True


def get_internal_id(tg_id: int) -> int:
    _ensure(tg_id)
    c = _conn()
    row = c.execute("SELECT id FROM users WHERE tg_id=?", (tg_id,)).fetchone()
    c.close()
    return row["id"] if row else tg_id


def get_all_tg_ids() -> list[int]:
    c = _conn()
    rows = c.execute("SELECT tg_id FROM users").fetchall()
    c.close()
    return [r["tg_id"] for r in rows]


# ── Click orderlar ────────────────────────────────────────────────────────────

def create_click_order(tg_id: int, amount: int) -> int:
    """Yangi pending order yaratadi, order_id qaytaradi"""
    _ensure(tg_id)
    with _lock:
        c = _conn()
        cur = c.execute(
            "INSERT INTO click_orders (tg_id, amount) VALUES (?, ?)",
            (tg_id, amount)
        )
        oid = cur.lastrowid
        c.commit()
        c.close()
    return oid


def get_click_order(order_id: int) -> Optional[dict]:
    c = _conn()
    row = c.execute("SELECT * FROM click_orders WHERE id=?", (order_id,)).fetchone()
    c.close()
    return dict(row) if row else None


def complete_click_order(order_id: int, click_trans_id: str) -> Optional[int]:
    """
    To'lov tasdiqlanganda:
      - status → 'paid'
      - foydalanuvchi balansiga amount qo'shiladi
      - tg_id qaytariladi (bot xabar yuborishi uchun)
    """
    with _lock:
        c = _conn()
        row = c.execute(
            "SELECT * FROM click_orders WHERE id=? AND status='pending'",
            (order_id,)
        ).fetchone()
        if not row:
            c.close()
            return None
        now = int(time.time())
        c.execute(
            "UPDATE click_orders SET status='paid', click_trans_id=?, updated_at=? WHERE id=?",
            (click_trans_id, now, order_id)
        )
        c.execute(
            "UPDATE users SET balance=balance+? WHERE tg_id=?",
            (row["amount"], row["tg_id"])
        )
        c.commit()
        tg_id = row["tg_id"]
        c.close()
    return tg_id


def cancel_click_order(order_id: int) -> None:
    with _lock:
        c = _conn()
        c.execute(
            "UPDATE click_orders SET status='cancelled', updated_at=? WHERE id=? AND status='pending'",
            (int(time.time()), order_id)
        )
        c.commit()
        c.close()


# DB ni import qilinganda avtomatik init
init_db()
