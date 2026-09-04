import os
from pathlib import Path
from zoneinfo import ZoneInfo


PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(PROJECT_DIR)))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"

APP_NAME = "启码 AI 学伴"
APP_TIMEZONE = ZoneInfo("Asia/Shanghai")
FREE_DAILY_QUESTIONS = max(0, int(os.getenv("FREE_DAILY_QUESTIONS", "5")))
PAYMENT_PROVIDER = os.getenv("PAYMENT_PROVIDER", "mock").strip().lower()

PLANS = {
    "starter_300": {
        "code": "starter_300",
        "name": "进阶学习包",
        "credits": 300,
        "amount_fen": 7900,
        "valid_days": 30,
    },
    "growth_500": {
        "code": "growth_500",
        "name": "持续学习包",
        "credits": 500,
        "amount_fen": 12000,
        "valid_days": 30,
        "recommended": True,
    },
}
