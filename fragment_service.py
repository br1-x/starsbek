"""
fragment_service.py — pyfragment orqali Stars va Premium sotib olish
"""
import os
import logging
from dotenv import load_dotenv

load_dotenv(".env", encoding="utf-8")

log = logging.getLogger("fragment_service")

# .env dan cookies dict ga parse qilish
def _parse_cookies(raw: str) -> dict:
    """
    'key=val; key2=val2' formatidagi stringni dict ga aylantiradi.
    """
    result = {}
    for part in raw.split(";"):
        part = part.strip()
        if "=" in part:
            k, _, v = part.partition("=")
            result[k.strip()] = v.strip()
    return result


def _build_client():
    """FragmentClient instance yaratadi"""
    from pyfragment import FragmentClient  # type: ignore

    seed    = os.getenv("SEED", "").strip()
    api_key = os.getenv("API_KEY", "").strip()
    raw_cookies = os.getenv("COOKIES", "").strip().strip('"')

    if not seed or not api_key or not raw_cookies:
        raise RuntimeError(
            "SEED, API_KEY yoki COOKIES .env da topilmadi!"
        )

    cookies = _parse_cookies(raw_cookies)
    return FragmentClient(seed=seed, api_key=api_key, cookies=cookies)


async def buy_stars(recipient: str, amount: int) -> dict:
    """
    pyfragment orqali Stars sotib oladi.
    recipient: '@username' yoki 'username' yoki 'https://t.me/username'
    amount: stars soni (min 50)
    Qaytaradi: {"success": True/False, "error": "..."}
    """
    try:
        async with _build_client() as client:
            result = await client.purchase_stars(
                recipient,
                amount=amount,
                payment_method="usdt_ton"   # TON/USDT bilan to'lov
            )
        log.info(
            f"✅ Stars yuborildi: {amount} → {recipient} | tx: {result.transaction_id}"
        )
        return {"success": True, "transaction_id": result.transaction_id}
    except Exception as e:
        log.error(f"❌ Stars xatolik: {e}")
        return {"success": False, "error": str(e)}


async def buy_premium(recipient: str, months: int) -> dict:
    """
    pyfragment orqali Premium sotib oladi.
    recipient: '@username' yoki 'username'
    months: 3 | 6 | 12
    Qaytaradi: {"success": True/False, "error": "..."}
    """
    try:
        async with _build_client() as client:
            result = await client.purchase_premium(
                recipient,
                months=months,
                payment_method="ton"
            )
        log.info(
            f"✅ Premium yuborildi: {months} oy → {recipient} | tx: {result.transaction_id}"
        )
        return {"success": True, "transaction_id": result.transaction_id}
    except Exception as e:
        log.error(f"❌ Premium xatolik: {e}")
        return {"success": False, "error": str(e)}
