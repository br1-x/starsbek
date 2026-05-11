"""
bot_main(v1).py — Telegram bot
Stars va Premium: pyfragment orqali
To'lov tizimi: click-pkg (Click Uzbekistan) + FastAPI webhook
"""
import asyncio
import json
import logging
import os
from typing import Optional, Callable, Dict, Any, Awaitable

# ── Aiogram imports ──────────────────────────────────────────────────────────
from aiogram import Bot, Dispatcher, F, BaseMiddleware
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
)
from aiogram.utils.keyboard import InlineKeyboardBuilder
from dotenv import load_dotenv

import db
import fragment_service


# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("bot.log", encoding="utf-8", mode="a")],
)
logging.getLogger("aiogram").setLevel(logging.CRITICAL)
logging.getLogger("aiogram.event").setLevel(logging.CRITICAL)
logging.getLogger("httpx").setLevel(logging.WARNING)

payment_logger = logging.getLogger("payment")
payment_logger.setLevel(logging.INFO)
_ph = logging.FileHandler("payments.log", encoding="utf-8")
_ph.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
payment_logger.addHandler(_ph)
payment_logger.propagate = True

service_logger = logging.getLogger("service")
service_logger.setLevel(logging.INFO)
_sh = logging.FileHandler("service.log", encoding="utf-8")
_sh.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
service_logger.addHandler(_sh)
service_logger.propagate = True

logger = logging.getLogger(__name__)

# ── Sozlamalar ────────────────────────────────────────────────────────────────
STAR_PRICE_UZS: int = int(os.getenv("STAR_RATE", "210"))

PREMIUM_PRICES: Dict[int, int] = {
    3:  160000,
    6:  250000,
    12: 395000,
}

MAINTENANCE_MODE: bool = os.getenv("MAINTENANCE_MODE", "false").lower() == "true"
ADMIN_IDS: list[int] = [
    int(x.strip()) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip().isdigit()
]

# Click sozlamalari (.env dan)
CLICK_SERVICE_ID  = os.getenv("CLICK_SERVICE_ID", "")
CLICK_MERCHANT_ID = os.getenv("CLICK_MERCHANT_ID", "")
CLICK_SECRET_KEY  = os.getenv("CLICK_SECRET_KEY", "")
CLICK_WEBHOOK_BASE = os.getenv("CLICK_WEBHOOK_BASE", "http://localhost:8080")

# Har bir user uchun oxirgi menyu message_id
user_last_menu_message: Dict[int, int] = {}

# TOP tizimi
top_stats: Dict[int, Dict] = {}


# ── Yordamchi funksiyalar ─────────────────────────────────────────────────────
def format_currency(amount: int) -> str:
    return f"{amount:,}".replace(",", " ") + " so'm"


def stars_to_uzs(stars: int) -> int:
    return stars * STAR_PRICE_UZS


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


def check_maintenance(user_id: int) -> bool:
    if not MAINTENANCE_MODE:
        return False
    return not is_admin(user_id)


def _normalize_username(text: str) -> Optional[str]:
    username = text.strip().lstrip("@")
    if not username:
        return None
    for ch in username:
        if not (ch.isalnum() or ch == "_"):
            return None
    return f"@{username}"


# ── Majburiy obuna ────────────────────────────────────────────────────────────
async def load_required_channels():
    try:
        with open("required_channels.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("channels", []), data.get("mode", "all")
    except Exception:
        return [], "all"


async def is_subscribed(bot: Bot, user_id: int) -> bool:
    channels, mode = await load_required_channels()
    if not channels:
        return True
    if mode == "all":
        for ch in channels:
            try:
                m = await bot.get_chat_member(chat_id=ch, user_id=user_id)
                if m.status in ("left", "kicked"):
                    return False
            except Exception:
                return False
        return True
    else:
        for ch in channels:
            try:
                m = await bot.get_chat_member(chat_id=ch, user_id=user_id)
                if m.status not in ("left", "kicked"):
                    return True
            except Exception:
                continue
        return False


# ── Middleware ────────────────────────────────────────────────────────────────
class MaintenanceMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[Any, Dict[str, Any]], Awaitable[Any]],
        event: Any,
        data: Dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        if user and check_maintenance(user.id):
            text = (
                "🔧 Botda texnik ishlar olib borilmoqda!\n\n"
                "⏰ Iltimos, keyinroq qaytib urinib ko'ring\n\n"
                "📞 Savollar uchun: @idk_uz"
            )
            try:
                if hasattr(event, "answer"):
                    await event.answer(text)
                elif hasattr(event, "message"):
                    await event.message.answer(text)
            except Exception:
                pass
            return None
        return await handler(event, data)


# ── FSM States ────────────────────────────────────────────────────────────────
class OrderFlow(StatesGroup):
    choosing_stars_amount  = State()
    entering_stars_amount  = State()
    choosing_premium_months = State()
    entering_recipient     = State()
    confirming             = State()
    waiting_payment        = State()
    payment_pending        = State()
    entering_deposit_amount = State()  # Yangi state — faqat deposit uchun


# ── Klaviaturalar ─────────────────────────────────────────────────────────────
def _main_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="STARS", callback_data="menu:stars", icon_custom_emoji_id="5285530266494868522"),
            InlineKeyboardButton(text="Premium", callback_data="menu:premium", icon_custom_emoji_id="5350572495311246545"),
        ],
        [
            InlineKeyboardButton(text=" Kabinet", callback_data="menu:cabinet", icon_custom_emoji_id="5208825487777873991"),
            InlineKeyboardButton(text=" Hisob to'ldirish", callback_data="menu:deposit", icon_custom_emoji_id="5409150983030728043"),
        ],
        [
            InlineKeyboardButton(text=" TOP", callback_data="menu:top", icon_custom_emoji_id="5188344996356448758"),
        ],
        [
            InlineKeyboardButton(text=" TEKIN STARS", callback_data="menu:referal", icon_custom_emoji_id="5285530266494868522"),
        ],
    ])


def _reply_menu_kb() -> ReplyKeyboardMarkup:
    keyboard = [
        [
            KeyboardButton(text="Menyu", request_contact=False),
        ],
    ]
    return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True)


def _stars_amount_kb() -> InlineKeyboardMarkup:
    presets = [50, 100, 150, 200, 500, 1000, 2000, 5000]
    rows = []
    for i in range(0, len(presets), 2):
        row = []
        for val in presets[i:i + 2]:
            price = stars_to_uzs(val)
            row.append(InlineKeyboardButton(
                text=f"{val} | {format_currency(price)}",
                callback_data=f"stars_amount:{val}",
                icon_custom_emoji_id="5285530266494868522"
            ))
        rows.append(row)
    rows.append([InlineKeyboardButton(text=" Boshqa miqdor", callback_data="stars_amount:custom", icon_custom_emoji_id="5285530266494868522")])
    rows.append([InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _premium_months_kb() -> InlineKeyboardMarkup:
    rows = []
    for months, price in PREMIUM_PRICES.items():
        rows.append([InlineKeyboardButton(
            text=f"{months} oy | {format_currency(price)}",
            callback_data=f"premium_months:{months}",
            icon_custom_emoji_id="5350572495311246545"
        )])
    rows.append([InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _subscription_kb() -> InlineKeyboardMarkup:
    rows = []
    try:
        with open("required_channels.json", "r", encoding="utf-8") as f:
            channels = json.load(f).get("channels", [])
    except Exception:
        channels = []
    for ch in channels:
        clean = ch.replace("@", "")
        rows.append([InlineKeyboardButton(text="📢 Kanal", url=f"https://t.me/{clean}")])
    rows.append([InlineKeyboardButton(text="✅ Tekshirish", callback_data="check_subscription", icon_custom_emoji_id="5346006983730301406", style="success")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


# ── Menyu yuborish ────────────────────────────────────────────────────────────
async def delete_old_menu(bot: Bot, user_id: int) -> None:
    if user_id in user_last_menu_message:
        try:
            await bot.delete_message(chat_id=user_id, message_id=user_last_menu_message[user_id])
        except Exception:
            pass
        del user_last_menu_message[user_id]


async def send_main_menu(bot: Bot, user_id: int) -> None:
    balance = db.get_balance(user_id)
    text = (
        f"<tg-emoji emoji-id='5314265599159868474'>💠</tg-emoji> Bosh menyu\n\n"
        f"<tg-emoji emoji-id='5314335546997250127'>💠</tg-emoji> ID: {db.get_internal_id(user_id)}\n"
        f"<tg-emoji emoji-id='5316706313110066208'>👛</tg-emoji> Balans: {format_currency(balance)}\n\n"
        f"<tg-emoji emoji-id='5314455174721345525'>⭐️</tg-emoji> 1 stars narxi: {STAR_PRICE_UZS} so'm\n\n"
        f"<tg-emoji emoji-id='5350699789551935589'>🛍</tg-emoji> Kerakli bo'limni tanlang:"
    )
    photo_url = os.getenv("MENU_PHOTO_URL", "").strip()
    if photo_url:
        try:
            sent = await bot.send_photo(
                chat_id=user_id, photo=photo_url,
                caption=text, parse_mode="HTML",
                reply_markup=_main_menu_kb(),
            )
            user_last_menu_message[user_id] = sent.message_id
            return
        except Exception:
            pass
    sent = await bot.send_message(
        chat_id=user_id, text=text,
        parse_mode="HTML", reply_markup=_main_menu_kb(),
    )
    user_last_menu_message[user_id] = sent.message_id


# ── TOP ───────────────────────────────────────────────────────────────────────
def update_top_stats(user_id: int, name: str, amount_uzs: int) -> None:
    if user_id not in top_stats:
        top_stats[user_id] = {"name": name, "total_uzs": 0, "orders": 0}
    top_stats[user_id]["name"] = name
    top_stats[user_id]["total_uzs"] += amount_uzs
    top_stats[user_id]["orders"] += 1


async def show_top(call: CallbackQuery) -> None:
    await call.answer()
    if not top_stats:
        text = (
            "<tg-emoji emoji-id='5314461045941639449'>☄️</tg-emoji> <b>Top xaridorlar</b>\n\n"
            "Hozircha hech kim xarid qilmagan.\n\nBirinchi bo'ling! ⭐"
        )
    else:
        sorted_users = sorted(top_stats.items(), key=lambda x: x[1]["total_uzs"], reverse=True)[:10]
        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
        lines = ["<tg-emoji emoji-id='5314461045941639449'>☄️</tg-emoji> <b>Top xaridorlar</b>\n"]
        for i, (uid, info) in enumerate(sorted_users):
            medal = medals[i] if i < len(medals) else f"{i+1}."
            lines.append(f"{medal} {info['name'] or f'User{uid}'} — {format_currency(info['total_uzs'])}")
        text = "\n".join(lines)

    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", custom_emoji_id="4960802211744449967"))
    try:
        await call.message.edit_caption(caption=text, parse_mode="HTML", reply_markup=builder.as_markup())
    except Exception:
        try:
            await call.message.edit_text(text, parse_mode="HTML", reply_markup=builder.as_markup())
        except Exception:
            await call.message.answer(text, parse_mode="HTML", reply_markup=builder.as_markup())


# ── /start va Menyu ───────────────────────────────────────────────────────────
async def cmd_start(message: Message, state: FSMContext) -> None:
    await state.clear()
    user_id = message.from_user.id
    await delete_old_menu(message.bot, user_id)
    try:
        await message.delete()
    except Exception:
        pass

    if not await is_subscribed(message.bot, user_id):
        await message.answer(
            "🚫 *Botdan foydalanish uchun avval kanallarga obuna bo'ling!*",
            parse_mode="Markdown",
            reply_markup=_subscription_kb(),
        )
        await state.set_state(OrderFlow.payment_pending)
        return

    await message.bot.send_message(
        chat_id=user_id,
        text="<tg-emoji emoji-id='5314461045941639449'>☄️</tg-emoji> Xush kelibsiz!",
        parse_mode="HTML",
        reply_markup=_reply_menu_kb(),
    )
    await send_main_menu(message.bot, user_id)


async def cmd_menu(message: Message, state: FSMContext) -> None:
    await state.clear()
    user_id = message.from_user.id
    await delete_old_menu(message.bot, user_id)
    try:
        await message.delete()
    except Exception:
        pass

    if not await is_subscribed(message.bot, user_id):
        await message.answer(
            "🚫 *Botdan foydalanish uchun avval kanallarga obuna bo'ling!*",
            parse_mode="Markdown",
            reply_markup=_subscription_kb(),
        )
        return

    await message.bot.send_message(
        chat_id=user_id,
        text="<tg-emoji emoji-id='5314461045941639449'>☄️</tg-emoji> Xush kelibsiz!",
        parse_mode="HTML",
        reply_markup=_reply_menu_kb(),
    )
    await send_main_menu(message.bot, user_id)


# ── Obuna tekshirish ──────────────────────────────────────────────────────────
async def check_subscription(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer()
    if await is_subscribed(call.bot, call.from_user.id):
        try:
            await call.message.delete()
        except Exception:
            pass
        await state.clear()
        await send_main_menu(call.bot, call.from_user.id)
    else:
        await call.answer("❌ Siz hali ham barcha kanallarga obuna bo'lmagansiz!", show_alert=True)


# ── Stars bo'limi ─────────────────────────────────────────────────────────────
async def menu_stars(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer("⭐ Stars bo'limi")
    await state.clear()
    if not await is_subscribed(call.bot, call.from_user.id):
        await call.message.answer(
            "🚫 *Botdan foydalanish uchun avval kanallarga obuna bo'ling!*",
            parse_mode="Markdown", reply_markup=_subscription_kb(),
        )
        return
    await state.update_data(product="stars")
    text = "⭐ *Olmoqchi bo'lgan starlaringiz miqdorini tanlang (50 – 5000)*"
    try:
        if call.message.photo:
            await call.message.edit_caption(caption=text, parse_mode="Markdown",
                                             reply_markup=_stars_amount_kb())
        else:
            await call.message.edit_text(text, parse_mode="Markdown",
                                          reply_markup=_stars_amount_kb())
    except Exception:
        await call.message.answer(text, parse_mode="Markdown", reply_markup=_stars_amount_kb())
    await state.set_state(OrderFlow.choosing_stars_amount)


async def on_stars_amount(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer()
    value = call.data.split(":", 1)[1]

    if value == "custom":
        await state.update_data(custom_input=True)
        await state.set_state(OrderFlow.entering_stars_amount)
        try:
            if call.message.photo:
                await call.message.edit_caption(
                    caption="💬 *Stars miqdorini kiriting (50 – 5000)*",
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text=" Orqaga", callback_data="menu:stars", icon_custom_emoji_id="4960802211744449967")],
                        [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
                    ])
                )
            else:
                await call.message.edit_text(
                    "💬 *Stars miqdorini kiriting (50 – 5000)*",
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text=" Orqaga", callback_data="menu:stars", icon_custom_emoji_id="4960802211744449967")],
                        [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
                    ])
                )
        except Exception:
            pass
        return

    try:
        amount = int(value)
    except ValueError:
        await call.answer("Noto'g'ri qiymat", show_alert=True)
        return

    if amount < 50 or amount > 1000000:
        await call.answer("Stars miqdori 50 dan 5000 gacha bo'lishi kerak", show_alert=True)
        return

    await state.update_data(stars_amount=amount, product="stars")
    price = stars_to_uzs(amount)
    text = (
        f"⭐ *Stars:* {amount} ta ({format_currency(price)})\n\n"
        f"👤 *Qabul qiluvchining @username ni kiriting*\n"
        f"Agar o'zingizga bo'lsa, pastdagi tugmani bosing"
    )
    try:
        if call.message.photo:
            await call.message.edit_caption(
                caption=text, parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="O'zimga", callback_data="recipient:self", icon_custom_emoji_id="5442710757970049177", style="primary")],
                    [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
                ])
            )
        else:
            await call.message.edit_text(
                text, parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="O'zimga", callback_data="recipient:self", icon_custom_emoji_id="5442710757970049177", style="primary")],
                    [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
                ])
            )
    except Exception:
        await call.message.answer(text, parse_mode="Markdown", reply_markup=builder.as_markup())
    await state.set_state(OrderFlow.entering_recipient)


# ── Premium bo'limi ───────────────────────────────────────────────────────────
async def menu_premium(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer("💎 Premium bo'limi")
    await state.clear()
    if not await is_subscribed(call.bot, call.from_user.id):
        await call.message.answer(
            "🚫 *Botdan foydalanish uchun avval kanallarga obuna bo'ling!*",
            parse_mode="Markdown", reply_markup=_subscription_kb(),
        )
        return
    await state.update_data(product="premium")
    text = "💎 *Premium sotib olish*\n\n*Premium muddatini tanlang:*"
    try:
        if call.message.photo:
            await call.message.edit_caption(caption=text, parse_mode="Markdown",
                                             reply_markup=_premium_months_kb())
        else:
            await call.message.edit_text(text, parse_mode="Markdown",
                                          reply_markup=_premium_months_kb())
    except Exception:
        await call.message.answer(text, parse_mode="Markdown", reply_markup=_premium_months_kb())
    await state.set_state(OrderFlow.choosing_premium_months)


async def on_premium_months(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer()
    try:
        months = int(call.data.split(":", 1)[1])
    except ValueError:
        await call.answer("Noto'g'ri qiymat", show_alert=True)
        return
    if months not in (3, 6, 12):
        await call.answer("Faqat 3/6/12 oy mavjud", show_alert=True)
        return

    await state.update_data(premium_months=months, product="premium")
    price = PREMIUM_PRICES[months]
    text = (
        f"💎 *Premium:* {months} oy ({format_currency(price)})\n\n"
        f"👤 *Qabul qiluvchining @username ni kiriting*\n"
        f"Agar o'zingizga bo'lsa, pastdagi tugmani bosing"
    )
    try:
        if call.message.photo:
            await call.message.edit_caption(
                caption=text, parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="O'zimga", callback_data="recipient:self", icon_custom_emoji_id="5442710757970049177", style="primary")],
                    [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
                ])
            )
        else:
            await call.message.edit_text(
                text, parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="O'zimga", callback_data="recipient:self", icon_custom_emoji_id="5442710757970049177", style="primary")],
                    [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
                ])
            )
    except Exception:
        await call.message.answer(text, parse_mode="Markdown", reply_markup=builder.as_markup())
    await state.set_state(OrderFlow.entering_recipient)


# ── Recipient (qabul qiluvchi) ────────────────────────────────────────────────
async def on_recipient_self(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer()
    username = call.from_user.username
    if not username:
        await call.message.answer(
            "Sizda username yo'q. Telegram sozlamalaridan username qo'ying, keyin qayta urinib ko'ring."
        )
        return
    await state.update_data(recipient=f"@{username}")
    await _show_confirm(call.message, state, user_id=call.from_user.id)


async def on_recipient_text(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    if not data.get("product"):
        return
    normalized = _normalize_username(message.text or "")
    if not normalized:
        await message.answer("Username noto'g'ri. Masalan: @username")
        return
    await state.update_data(recipient=normalized)
    await _show_confirm(message, state)


async def on_stars_amount_text(message: Message, state: FSMContext) -> None:
    """Stars custom miqdor kiritish"""
    data = await state.get_data()
    if not data.get("custom_input"):
        return
    try:
        amount = int((message.text or "").strip())
    except ValueError:
        await message.answer("❌ Iltimos, faqat raqam kiriting.")
        return
    if amount < 50 or amount > 1000000:
        await message.answer("❌ Stars miqdori 50 dan 5000 gacha bo'lishi kerak")
        return
    await state.update_data(stars_amount=amount, custom_input=False, product="stars")
    price = stars_to_uzs(amount)
    text = (
        f"⭐ *Stars:* {amount} ta ({format_currency(price)})\n\n"
        f"👤 *Qabul qiluvchining @username ni kiriting*\n"
        f"Agar o'zingizga bo'lsa, pastdagi tugmani bosing"
    )
    await message.answer(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="O'zimga", callback_data="recipient:self", icon_custom_emoji_id="5442710757970049177", style="primary")],
        [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
    ]))
    await state.set_state(OrderFlow.entering_recipient)


# ── Tasdiqlash sahifasi ───────────────────────────────────────────────────────
async def _show_confirm(message: Message, state: FSMContext, user_id: int = None) -> None:
    data = await state.get_data()
    product   = data.get("product")
    recipient = data.get("recipient")
    if user_id is None:
        user_id = message.from_user.id

    user_balance = db.get_balance(user_id)

    if product == "stars":
        stars_amount = data.get("stars_amount", 0)
        if not stars_amount or stars_amount < 50:
            await message.answer("❌ Stars miqdori tanlanmagan yoki noto'g'ri!")
            await state.clear()
            return
        cost_uzs = stars_to_uzs(stars_amount)
        product_text = f"⭐ Miqdor: *{stars_amount} ta*"
    else:
        months = data.get("premium_months", 0)
        if not months:
            await message.answer("❌ Premium muddati tanlanmagan!")
            await state.clear()
            return
        cost_uzs = PREMIUM_PRICES.get(months, 0)
        if not cost_uzs:
            await message.answer("❌ Noto'g'ri Premium muddati!")
            await state.clear()
            return
        product_text = f"💎 Miqdor: *{months} oy*"

    if user_balance < cost_uzs:
        text = (
            f"⚠️ *Hisobingizda mablag' yetarli emas!*\n\n"
            f"👤Qabul qiluvchi `{recipient}`\n"
            f"{product_text}\n\n"
            f"💰 Narxi: *{format_currency(cost_uzs)}*\n"
            f"💳 Balansingiz: *{format_currency(user_balance)}*\n"
            f"❌ Kerak: *{format_currency(cost_uzs - user_balance)}*"
        )
        await message.answer(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Hisob to'ldirish", callback_data="menu:deposit", icon_custom_emoji_id="5409150983030728043", style="primary")],
            [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
        ]))
        await state.clear()
    else:
        text = (
            f"<tg-emoji emoji-id='5461114091537989303'>�</tg-emoji> Qabul qiluvchi: `{recipient}`\n"
            f"{product_text}\n\n"
            f"💰 Narxi: *{format_currency(cost_uzs)}*\n"
            f"💳 Balansingiz: *{format_currency(user_balance)}*"
        )
        await message.answer(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Tasdiqlash", callback_data="confirm:send", icon_custom_emoji_id="5215470137192229422", style="success")],
            [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
        ]))
        await state.set_state(OrderFlow.confirming)


# ── Buyurtmani yuborish (pyfragment) ─────────────────────────────────────────
async def on_confirm_send(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer()
    data      = await state.get_data()
    product   = data.get("product")
    recipient = data.get("recipient")
    user_id   = call.from_user.id

    if product not in ("stars", "premium") or not recipient:
        await call.message.answer("Buyurtma topilmadi. /start")
        await state.clear()
        return

    if product == "stars":
        stars_amount = int(data.get("stars_amount") or 0)
        cost_uzs     = stars_to_uzs(stars_amount)
        months       = None
    else:
        months   = int(data.get("premium_months") or 0)
        cost_uzs = PREMIUM_PRICES.get(months, 0)
        stars_amount = 0

    # Balans tekshirish
    if db.get_balance(user_id) < cost_uzs:
        await call.message.answer(
            f"❌ Balans yetarli emas!\nKerak: {format_currency(cost_uzs)}\n"
            f"Balans: {format_currency(db.get_balance(user_id))}",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="Hisob to'ldirish", callback_data="menu:deposit", icon_custom_emoji_id="5409150983030728043", style="primary")],
            ]),
        )
        await state.clear()
        return

    processing = await call.message.answer("⏳ Bajarilmoqda...")

    # pyfragment orqali sotib olish
    if product == "stars":
        service_logger.info(f"🌟 Stars buyurtma: user={user_id}, recipient={recipient}, amount={stars_amount}")
        result = await fragment_service.buy_stars(recipient, stars_amount)
    else:
        service_logger.info(f"💎 Premium buyurtma: user={user_id}, recipient={recipient}, months={months}")
        result = await fragment_service.buy_premium(recipient, months)

    try:
        await processing.delete()
    except Exception:
        pass

    if result.get("success"):
        if db.deduct_balance(user_id, cost_uzs):
            service_logger.info(
                f"✅ Muvaffaqiyatli: user={user_id}, product={product}, cost={cost_uzs}"
            )
            payment_logger.info(
                f"💸 Balansdan yechildi: user={user_id}, amount={cost_uzs}, "
                f"qoldi={db.get_balance(user_id)}"
            )
            try:
                await call.message.delete()
            except Exception:
                pass

            await call.message.answer(
                f"✅ *Buyurtma muvaffaqiyatli!*\n\n"
                f"<tg-emoji emoji-id='5461114091537989303'>�</tg-emoji> Qabul qiluvchi: {recipient}\n"
                f"💰 Narx: {format_currency(cost_uzs)}\n"
                f"💳 Qolgan balans: {format_currency(db.get_balance(user_id))}",
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")],
                ]),
            )
            # Feedback kanaliga xabar
            await _send_feedback(call.bot, call.from_user, product, recipient, cost_uzs, months)
            # TOP yangilash
            name = (f"@{call.from_user.username}" if call.from_user.username
                    else call.from_user.first_name or f"User{user_id}")
            update_top_stats(user_id, name, cost_uzs)
        else:
            await call.message.answer("❌ Balansdan yechishda xatolik. Admin bilan bog'laning.")
    else:
        error_msg = result.get("error", "Noma'lum xatolik")
        service_logger.error(f"❌ Fragment xatolik: {error_msg}")
        await call.message.answer(
            f"❌ Buyurtmani bajarishda xatolik.\n\nXatolik: {error_msg}\n\n"
            f"Iltimos, qo'llab-quvvatlash bilan bog'laning.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="📞 Qo'llab-quvvatlash", url=os.getenv("SUPPORT_URL", "https://t.me/idk_uz"))],
                [InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")],
            ]),
        )

    await state.clear()


# ── Click to'lov (Hisob to'ldirish) ──────────────────────────────────────────
async def cmd_deposit(call: CallbackQuery, state: FSMContext) -> None:
    """Hisob to'ldirish — Click to'lov linki generatsiya"""
    await call.answer("Hisob to'ldirish")
    await state.clear()

    if not await is_subscribed(call.bot, call.from_user.id):
        await call.message.answer(
            "🚫 *Botdan foydalanish uchun avval kanallarga obuna bo'ling!*",
            parse_mode="Markdown", reply_markup=_subscription_kb(),
        )
        return

    user_id = call.from_user.id
    current_balance = db.get_balance(user_id)

    text = (
        f"<tg-emoji emoji-id='5316706313110066208'>👛</tg-emoji> Balansingiz: {format_currency(current_balance)}\n\n"
        f"<tg-emoji emoji-id='5314298949580922732'>💠</tg-emoji> Balans to'ldirish uchun summani kiriting:\n"
        f"🔹 Minimal miqdor: 1 000 so'm\n"
        f"🔹 Misol uchun: 10000\n\n"
        f"Summani raqam shaklida kiriting:"
    )
    try:
        await call.message.delete()
    except Exception:
        pass

    sent = await call.bot.send_message(
        chat_id=user_id, text=text,
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Bekor qilish", callback_data="deposit:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
        ]),
    )
    await state.update_data(deposit_msg_id=sent.message_id)
    await state.set_state(OrderFlow.entering_deposit_amount)


async def on_deposit_amount(message: Message, state: FSMContext) -> None:
    """Foydalanuvchi summa kiritganda Click to'lov linki yuborish"""
    data = await state.get_data()
    
    # Deposit xabarini o'chirish
    dep_msg_id = data.get("deposit_msg_id")
    if dep_msg_id:
        try:
            await message.bot.delete_message(chat_id=message.from_user.id, message_id=dep_msg_id)
        except Exception:
            pass
    try:
        await message.delete()
    except Exception:
        pass

    await state.clear()
    user_id = message.from_user.id

    try:
        amount = int((message.text or "").strip())
    except ValueError:
        await message.answer("❌ Iltimos, faqat raqam kiriting.")
        return

    if amount < 1000:
        await message.answer("❌ Minimal to'lov miqdori 1 000 so'm.")
        return

    # Click webhook serveridan to'lov linki olish
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{CLICK_WEBHOOK_BASE}/click/pay_link",
                params={"tg_id": user_id, "amount": amount},
            )
            resp.raise_for_status()
            result = resp.json()
    except Exception as e:
        logger.error(f"Click pay_link xatolik: {e}")
        await message.answer(
            "❌ To'lov tizimida xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring."
        )
        return

    pay_link  = result["pay_link"]
    order_id  = result["order_id"]
    amount_fmt = format_currency(amount)

    await message.answer(
        f"<tg-emoji emoji-id='5366380856883554836'>🤍</tg-emoji> <b>Click orqali to'lov</b>\n\n"
        f"<tg-emoji emoji-id='4963095500942214222'>💠</tg-emoji> Miqdor: <b>{amount_fmt}</b>\n"
        f"<tg-emoji emoji-id='5314321700022688577'>🤍</tg-emoji> Order ID: <code>{order_id}</code>\n\n"
        f"<tg-emoji emoji-id='5314600039673274467'>⚠️</tg-emoji> Pastdagi tugmani bosib to'lovni amalga oshiring.\n"
        f"To'lov tasdiqlangandan so'ng balans <b>avtomatik</b> to'ldiriladi!",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Click orqali to'lash", url=pay_link, icon_custom_emoji_id="5366380856883554836")],
            [InlineKeyboardButton(text="Bekor qilish", callback_data="nav:cancel", icon_custom_emoji_id="5210952531676504517", style="danger")],
        ]),
    )
    payment_logger.info(f"🔗 Click to'lov yaratildi: user={user_id}, order={order_id}, amount={amount}")


async def deposit_cancel(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer("Bekor qilindi")
    data = await state.get_data()
    dep_msg_id = data.get("deposit_msg_id")
    await state.clear()
    try:
        if dep_msg_id:
            await call.bot.delete_message(chat_id=call.from_user.id, message_id=dep_msg_id)
        else:
            await call.message.delete()
    except Exception:
        pass
    await send_main_menu(call.bot, call.from_user.id)


# ── Kabinet ───────────────────────────────────────────────────────────────────
async def cmd_cabinet(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer("👤 Kabinet")
    await state.clear()
    user_id = call.from_user.id
    balance = db.get_balance(user_id)
    text = (
        f"<tg-emoji emoji-id='5314335546997250127'>💠</tg-emoji> Kabinet\n\n"
        f"<tg-emoji emoji-id='5314335546997250127'>💠</tg-emoji> ID: {db.get_internal_id(user_id)}\n"
        f"<tg-emoji emoji-id='5316706313110066208'>👛</tg-emoji> Balans: {format_currency(balance)}\n"
    )
    try:
        if call.message.photo:
            await call.message.edit_caption(
                caption=text, parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="Hisob to'ldirish", callback_data="menu:deposit", icon_custom_emoji_id="5409150983030728043", style="primary")],
                    [InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")],
                ])
            )
        else:
            await call.message.edit_text(
                text, parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="Hisob to'ldirish", callback_data="menu:deposit", icon_custom_emoji_id="5409150983030728043", style="primary")],
                    [InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")],
                ])
            )
    except Exception:
        await call.message.answer(
            text, parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="Hisob to'ldirish", callback_data="menu:deposit", icon_custom_emoji_id="5409150983030728043", style="primary")],
                [InlineKeyboardButton(text=" Orqaga", callback_data="nav:menu", icon_custom_emoji_id="4960802211744449967")],
            ])
        )


# ── Nav handlers ──────────────────────────────────────────────────────────────
async def nav_menu(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer("Bosh menyuga qaytildi")
    await state.clear()
    try:
        await call.message.delete()
    except Exception:
        pass
    await send_main_menu(call.bot, call.from_user.id)


async def nav_deposit(call: CallbackQuery, state: FSMContext) -> None:
    await cmd_deposit(call, state)


async def nav_cancel(call: CallbackQuery, state: FSMContext) -> None:
    await call.answer("Bekor qilindi")
    await state.clear()
    try:
        await call.message.delete()
    except Exception:
        pass
    await send_main_menu(call.bot, call.from_user.id)


# ── Feedback kanal ────────────────────────────────────────────────────────────
async def _send_feedback(bot: Bot, user, product: str, recipient: str,
                          cost: int, months: int = None) -> None:
    channel_id = os.getenv("FEEDBACK_CHANNEL_ID", "").strip()
    if not channel_id:
        return
    try:
        if user.username:
            mention = f"@{user.username}"
        else:
            name = (user.first_name or "User").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            mention = f'<a href="tg://user?id={user.id}">{name}</a>'

        if product == "stars":
            stars_count = cost // STAR_PRICE_UZS
            text = (
                f"<tg-emoji emoji-id='5314461045941639449'>☄️</tg-emoji> Yangi sotib olish!\n\n"
                f"<tg-emoji emoji-id='5314335546997250127'>💠</tg-emoji> Haridor: {mention}\n"
                f"<tg-emoji emoji-id='5285530266494868522'>⭐️</tg-emoji> Mahsulot: {stars_count} ta Stars\n"
                f"<tg-emoji emoji-id='5461114091537989303'>📥</tg-emoji> Qabul qiluvchi: {recipient}\n"
                f"<tg-emoji emoji-id='5411229858871144095'>✅</tg-emoji> Narxi: {format_currency(cost)}"
            )
        else:
            text = (
                f"<tg-emoji emoji-id='5314461045941639449'>☄️</tg-emoji> Yangi sotib olish!\n\n"
                f"<tg-emoji emoji-id='5314335546997250127'>💠</tg-emoji> Haridor: {mention}\n"
                f"<tg-emoji emoji-id='5350572495311246545'>💎</tg-emoji> Mahsulot: Premium ({months} oy)\n"
                f"<tg-emoji emoji-id='5461114091537989303'>📥</tg-emoji> Qabul qiluvchi: {recipient}\n"
                f"<tg-emoji emoji-id='5411229858871144095'>✅</tg-emoji> Narxi: {format_currency(cost)}"
            )
        await bot.send_message(chat_id=channel_id, text=text, parse_mode="HTML")
    except Exception as e:
        service_logger.error(f"Feedback xatolik: {e}")


# ── Admin komandalar ──────────────────────────────────────────────────────────
async def cmd_stats(message: Message) -> None:
    if not is_admin(message.from_user.id):
        await message.answer("⛔ Ruxsat yo'q!")
        return
    total_users = len(db.get_all_tg_ids())
    total_balance = sum(db.get_balance(uid) for uid in db.get_all_tg_ids())
    await message.answer(
        f"📊 *Bot statistikasi*\n\n"
        f"👥 Jami foydalanuvchilar: *{total_users}*\n"
        f"💰 Umumiy balans: *{format_currency(total_balance)}*\n"
        f"🏆 Top da: *{len(top_stats)}* foydalanuvchi\n\n"
        f"📝 Komandalar:\n"
        f"`/stats` — Statistika\n"
        f"`/restart_top` — Top tozalash\n"
        f"`/addbalance <tg_id> <amount>` — Balans qo'shish",
        parse_mode="Markdown",
    )


async def cmd_restart_top(message: Message) -> None:
    if not is_admin(message.from_user.id):
        await message.answer("⛔ Ruxsat yo'q!")
        return
    top_stats.clear()
    await message.answer("✅ Top statistikasi tozalandi!")


async def cmd_add_balance(message: Message) -> None:
    """Admin: /addbalance <tg_id> <amount>"""
    if not is_admin(message.from_user.id):
        await message.answer("⛔ Ruxsat yo'q!")
        return
    parts = (message.text or "").split()
    if len(parts) != 3:
        await message.answer("Foydalanish: /addbalance <tg_id> <amount>")
        return
    try:
        tg_id  = int(parts[1])
        amount = int(parts[2])
    except ValueError:
        await message.answer("❌ Noto'g'ri format")
        return
    db.add_balance(tg_id, amount)
    await message.answer(
        f"✅ {tg_id} ga {format_currency(amount)} qo'shildi.\n"
        f"Yangi balans: {format_currency(db.get_balance(tg_id))}"
    )


# ── main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    load_dotenv(".env", encoding="utf-8")

    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BOT_TOKEN .env da topilmadi!")

    bot = Bot(token=token)
    dp  = Dispatcher(storage=MemoryStorage())

    # Middleware
    dp.message.middleware(MaintenanceMiddleware())
    dp.callback_query.middleware(MaintenanceMiddleware())

    # ── Handlerlar ─────────────────────────────────────────────────────────
    dp.message.register(cmd_start, CommandStart())
    dp.message.register(cmd_menu,  F.text.in_(["🏠 Menyu", "Menyu"]))

    # Stars
    dp.callback_query.register(menu_stars,       F.data == "menu:stars")
    dp.callback_query.register(on_stars_amount,  F.data.startswith("stars_amount:"))

    # Premium
    dp.callback_query.register(menu_premium,     F.data == "menu:premium")
    dp.callback_query.register(on_premium_months, F.data.startswith("premium_months:"))

    # Recipient
    dp.callback_query.register(on_recipient_self, F.data == "recipient:self")
    dp.message.register(on_stars_amount_text,     OrderFlow.entering_stars_amount)
    dp.message.register(on_recipient_text,        OrderFlow.entering_recipient)

    # Tasdiqlash
    dp.callback_query.register(on_confirm_send, F.data == "confirm:send")

    # Deposit (Click)
    dp.callback_query.register(cmd_deposit,    F.data == "menu:deposit")
    dp.callback_query.register(nav_deposit,    F.data == "nav:deposit")
    dp.callback_query.register(deposit_cancel, F.data == "deposit:cancel")
    dp.message.register(on_deposit_amount,     OrderFlow.entering_deposit_amount)

    # Kabinet
    dp.callback_query.register(cmd_cabinet, F.data == "menu:cabinet")

    # TOP
    dp.callback_query.register(show_top, F.data == "menu:top")

    # Nav
    dp.callback_query.register(nav_menu,   F.data == "nav:menu")
    dp.callback_query.register(nav_cancel, F.data == "nav:cancel")

    # Obuna
    dp.callback_query.register(check_subscription, F.data == "check_subscription")

    # Admin
    dp.message.register(cmd_stats,       F.text.startswith("/stats"))
    dp.message.register(cmd_restart_top, F.text.startswith("/restart_top"))
    dp.message.register(cmd_add_balance, F.text.startswith("/addbalance"))

    print("🤖 Bot ishga tushdi!")
    print(f"   STAR_PRICE_UZS : {STAR_PRICE_UZS} so'm")
    print(f"   MAINTENANCE    : {MAINTENANCE_MODE}")
    print(f"   ADMIN_IDS      : {ADMIN_IDS}")
    print(f"   CLICK_WEBHOOK  : {CLICK_WEBHOOK_BASE}")

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
