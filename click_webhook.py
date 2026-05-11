"""
click_webhook.py — Click to'lov webhook serveri (FastAPI, click-pkg dan mustaqil)

Click PREPARE + COMPLETE so'rovlarini qabul qiladi, imzoni tekshiradi,
muvaffaqiyatli to'lovda foydalanuvchi balansini to'ldiradi va Telegram xabar yuboradi.

Ishga tushirish:
    uvicorn click_webhook:app --host 0.0.0.0 --port 8080

Click dashboard da webhook URL:
    https://your-domain.com/click/webhook

To'lov linki generatsiya:
    GET /click/pay_link?tg_id=123456789&amount=10000
"""
import hashlib
import logging
import os
import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv(".env", encoding="utf-8")

import db

log = logging.getLogger("click_webhook")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler("click.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

# ── Sozlamalar ────────────────────────────────────────────────────────────────
CLICK_SERVICE_ID  = os.getenv("CLICK_SERVICE_ID", "")
CLICK_MERCHANT_ID = os.getenv("CLICK_MERCHANT_ID", "")
CLICK_SECRET_KEY  = os.getenv("CLICK_SECRET_KEY", "")
CLICK_RETURN_URL  = os.getenv("CLICK_RETURN_URL", "https://t.me/")
BOT_TOKEN         = os.getenv("BOT_TOKEN", "")

ACTION_PREPARE  = "0"
ACTION_COMPLETE = "1"


# ── Imzo tekshiruvi ───────────────────────────────────────────────────────────
def _verify_sign(p: dict, is_prepare: bool) -> bool:
    """
    Click imzosini tekshiradi.
    PREPARE:  MD5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
    COMPLETE: MD5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
    """
    parts = [
        p.get("click_trans_id", ""),
        CLICK_SERVICE_ID,
        CLICK_SECRET_KEY,
        p.get("merchant_trans_id", ""),
    ]
    if not is_prepare:
        parts.append(p.get("merchant_prepare_id", ""))
    parts += [
        p.get("amount", ""),
        p.get("action", ""),
        p.get("sign_time", ""),
    ]
    text = "".join(str(x) for x in parts)
    calculated = hashlib.md5(text.encode("utf-8")).hexdigest()
    return calculated == p.get("sign_string", "")


# ── Telegram xabar ────────────────────────────────────────────────────────────
async def _notify_user(tg_id: int, text: str) -> None:
    if not BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json={"chat_id": tg_id, "text": text, "parse_mode": "HTML"},
            )
    except Exception as e:
        log.error(f"Telegram xabar xatolik: {e}")


# ── To'lov linki ──────────────────────────────────────────────────────────────
def _build_pay_link(order_id: int, amount: int) -> str:
    return (
        f"https://my.click.uz/services/pay"
        f"?service_id={CLICK_SERVICE_ID}"
        f"&merchant_id={CLICK_MERCHANT_ID}"
        f"&amount={amount}"
        f"&transaction_param={order_id}"
        f"&return_url={CLICK_RETURN_URL}"
    )


# ── FastAPI ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("✅ Click webhook server ishga tushdi")
    yield
    log.info("🛑 Click webhook server to'xtatildi")


app = FastAPI(title="Click Webhook", lifespan=lifespan)


@app.post("/click/webhook")
async def click_webhook(request: Request):
    """
    Click PREPARE (action=0) va COMPLETE (action=1) so'rovlarini qabul qiladi.
    """
    form = await request.form()
    p = dict(form)

    action            = p.get("action", "")
    merchant_trans_id = p.get("merchant_trans_id", "")
    click_trans_id    = p.get("click_trans_id", "")
    error             = int(p.get("error", "0") or "0")

    # order_id parse
    try:
        order_id = int(merchant_trans_id)
    except (TypeError, ValueError):
        return JSONResponse({"error": -9, "error_note": "Bad merchant_trans_id"})

    # DB dan orderni olish
    order = db.get_click_order(order_id)
    if not order:
        return JSONResponse({"error": -5, "error_note": "Order not found"})

    # ── PREPARE (action=0) ────────────────────────────────────────────────────
    if action == ACTION_PREPARE:
        if not _verify_sign(p, is_prepare=True):
            log.warning(f"PREPARE imzo xato: order={order_id}")
            return JSONResponse({"error": -1, "error_note": "SIGN CHECK FAILED"})

        log.info(f"PREPARE: order={order_id}, amount={order['amount']}")
        return JSONResponse({
            "click_trans_id":    click_trans_id,
            "merchant_trans_id": order_id,
            "merchant_prepare_id": order_id,   # prepare_id sifatida order_id ishlatamiz
            "error": 0,
            "error_note": "success",
        })

    # ── COMPLETE (action=1) ───────────────────────────────────────────────────
    elif action == ACTION_COMPLETE:
        if not _verify_sign(p, is_prepare=False):
            log.warning(f"COMPLETE imzo xato: order={order_id}")
            return JSONResponse({"error": -1, "error_note": "SIGN CHECK FAILED"})

        # Xatolik yoki bekor qilish
        if error < 0:
            db.cancel_click_order(order_id)
            log.info(f"❌ To'lov bekor qilindi: order={order_id}, error={error}")
            return JSONResponse({
                "click_trans_id":    click_trans_id,
                "merchant_trans_id": order_id,
                "merchant_prepare_id": order_id,
                "error": error,
                "error_note": p.get("error_note", "cancelled"),
            })

        # Muvaffaqiyatli to'lov
        tg_id = db.complete_click_order(order_id, click_trans_id)
        if tg_id:
            balance    = db.get_balance(tg_id)
            amount_fmt = f"{order['amount']:,}".replace(",", " ")
            bal_fmt    = f"{balance:,}".replace(",", " ")
            asyncio.create_task(_notify_user(
                tg_id,
                f"✅ <b>To'lov qabul qilindi!</b>\n\n"
                f"💰 Qo'shildi: <b>{amount_fmt} so'm</b>\n"
                f"👛 Yangi balans: <b>{bal_fmt} so'm</b>",
            ))
            log.info(f"✅ To'lov tasdiqlandi: order={order_id}, tg_id={tg_id}, amount={order['amount']}")
        else:
            log.warning(f"complete_click_order None qaytardi: order={order_id} (allaqachon to'langan?)")

        return JSONResponse({
            "click_trans_id":    click_trans_id,
            "merchant_trans_id": order_id,
            "merchant_prepare_id": order_id,
            "error": 0,
            "error_note": "success",
        })

    return JSONResponse({"error": -9, "error_note": "Unknown action"})


# ── To'lov linki generatsiya ──────────────────────────────────────────────────
@app.get("/click/pay_link")
async def generate_pay_link(tg_id: int, amount: int):
    """
    Bot bu endpointga murojaat qilib Click to'lov linki oladi.
    """
    if amount < 1000:
        return JSONResponse({"error": "Minimal miqdor 1000 so'm"}, status_code=400)

    order_id = db.create_click_order(tg_id, amount)
    pay_link = _build_pay_link(order_id, amount)

    log.info(f"🔗 To'lov linki: order={order_id}, tg_id={tg_id}, amount={amount}")
    return JSONResponse({"order_id": order_id, "pay_link": pay_link, "amount": amount})


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}
