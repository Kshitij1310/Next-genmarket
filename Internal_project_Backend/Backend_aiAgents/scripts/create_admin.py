"""
One-time admin creation script.
Creates/updates admin record with hashed password in `admins` collection.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pymongo import MongoClient

from core.config import settings
from core.security import hash_password


def main() -> None:
    email = "hellojay@gmail.com"
    password = "12345678"

    client = MongoClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    doc = {
        "email": email,
        "password_hash": hash_password(password),
        "role": "admin",
        "customer_id": "12345678",
    }

    db.admins.update_one({"email": email}, {"$set": doc}, upsert=True)
    print(f"Admin upserted: {email}")


if __name__ == "__main__":
    main()
