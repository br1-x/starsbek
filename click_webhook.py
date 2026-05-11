"""
click_webhook.py — click-pkg (FastAPI) orqali Click to'lov webhook serveri.

Ishga tushirish:
    uvicorn click_webhook:app --host 0.0.0.0 --port 8080

Click dashboard da webhook URL:
    https://your-domain.com/click/webhook

To'lov linki generatsiya:
    /click/pay_link?tg_id=123456789&amount=10000
"""
import os
import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv(".env", encoding="utf-8")

import db  # noqa: E402  — db.py dan balans funksiyalari

log = logging.getLogger("click_webhook")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.FileHandler("click.log", encoding="utf-8"),
              logging.StreamHandler()]
)

# ── Click sozlamalari ─────────────────────────────────────────────────────────
CLICK_SERVICE_ID  = os.getenv("CLICK_SERVICE_ID", "")
CLICK_MERCHANT_ID = os.getenv("CLICK_MERCHANT_ID", "")
CLICK_SECRET_KEY  = os.getenv("CLICK_SECRET_KEY", "")

# Bot token — webhook muvaffaqiyatli bo'lganda foydalanuvchiga xabar yuborish
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# ── click-pkg FastAPI integratsiyasi ──────────────────────────────────────────
from clickup_fastapi.core.client import ClickUp                    # type: ignore
from clickup_fastapi.utils.const import Action                     # type: ignore
from clickup_fastapi.api.webhook import process_webhook, Account   # type: ignore
from clickup_fastapi.dependencies import ClickSettings             # type: ignore

click_settings = ClickSettings(
    service_id=CLICK_SERVICE_ID,
    merchant_id=CLICK_MERCHANT_ID,
    secret_key=CLICK_SECRET_KEY,
)

click_client = ClickUp(
    service_id=CLICK_SERVICE_ID,
    merchant_id=CLICK_MERCHANT_ID,
    secret_key=CLICK_SECRET_KEY,
)


# ── Bot xabar yuboruvchi (aiogram) ────────────────────────────────────────────
async def _notify_user(tg_id: int, text: str) -> None:
    """Foydalanuvchiga Telegram xabari yuborish"""
    if not BOT_TOKEN:
        return
    try:
        import httpx
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient() as client:
            await client.post(url, json={
                "chat_id": tg_id,
                "text": text,
                "parse_mode": "HTML"
            })
    except Exception as e:
        log.error(f"Telegram xabar xatolik: {e}")


# ── FastAPI app ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("✅ Click webhook server ishga tushdi")
    yield
    log.info("🛑 Click webhook server to'xtatildi")


app = FastAPI(title="Click Webhook", lifespan=lifespan)


# ── Webhook endpoint ──────────────────────────────────────────────────────────
@app.post("/click/webhook")
async def click_webhook(request: Request):
    """
    Click to'lov tizimi bu endpointga PREPARE va COMPLETE so'rovlar yuboradi.
    click-pkg kutubxonasi barcha imzo tekshiruvi va logikani o'zi bajaradi.
    """
    params = await request.form()
    merchant_trans_id = params.get("merchant_trans_id")  # bu bizning order_id

    # DB dan orderni olish
    try:
        order_id = int(merchant_trans_id)
    except (TypeError, ValueError):
        return JSONResponse({"error": -9, "error_note": "Bad merchant_trans_id"})

    order = db.get_click_order(order_id)
    if not order:
        return JSONResponse({"error": -5, "error_note": "Order not found"})

    account = Account(
        id=order["id"],
        amount=order["amount"]
    )

    # click-pkg webhook processor
    response = await process_webhook(params, None, click_settings, account)

    action = params.get("action")
    error_code = response.get("error", -1)

    # COMPLETE + muvaffaqiyatli
    if action == Action.COMPLETE and error_code >= 0:
        click_trans_id = str(params.get("click_trans_id", ""))
        tg_id = db.complete_click_order(order_id, click_trans_id)

        if tg_id:
            balance = db.get_balance(tg_id)
            amount_fmt = f"{order['amount']:,}".replace(",", " ")
            balance_fmt = f"{balance:,}".replace(",", " ")
            asyncio.create_task(_notify_user(
                tg_id,
                f"✅ <b>To'lov qabul qilindi!</b>\n\n"
                f"💰 Qo'shildi: <b>{amount_fmt} so'm</b>\n"
                f"👛 Yangi balans: <b>{balance_fmt} so'm</b>"
            ))
            log.info(f"✅ To'lov tasdiqlandi: order={order_id}, tg_id={tg_id}, amount={order['amount']}")

    # COMPLETE + bekor qilingan
    elif action == Action.COMPLETE and error_code < 0:
        db.cancel_click_order(order_id)
        log.info(f"❌ To'lov bekor qilindi: order={order_id}")

    return JSONResponse(response)


# ── To'lov linki generatsiya ──────────────────────────────────────────────────
@app.get("/click/pay_link")
async def generate_pay_link(tg_id: int, amount: int):
    """
    Foydalanuvchi uchun Click to'lov linki yaratadi.
    Parametrlar: tg_id, amount (so'mda, min 1000)
    """
    if amount < 1000:
        return JSONResponse({"error": "Minimal miqdor 1000 so'm"}, status_code=400)

    # DB da order yaratish
    order_id = db.create_click_order(tg_id, amount)

    # Click to'lov linki
    pay_link = await click_client.initializer.generate_pay_link(
        id=order_id,
        amount=amount,
        return_url=os.getenv("CLICK_RETURN_URL", "https://t.me/")
    )

    log.info(f"🔗 To'lov linki yaratildi: order={order_id}, tg_id={tg_id}, amount={amount}")
    return JSONResponse({
        "order_id": order_id,
        "pay_link": pay_link,
        "amount": amount
    })


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}
