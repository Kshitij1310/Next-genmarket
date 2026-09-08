from __future__ import annotations

from typing import Dict, Any
from uuid import uuid4

from core.security import hash_password, verify_password, create_access_token


def _generate_customer_id() -> str:
    return f"CUST-{uuid4().hex[:8].upper()}"


def create_user(db, email: str, password: str, name: str | None = None) -> Dict[str, Any]:
    existing = db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise ValueError("Email already registered")

    customer_id = _generate_customer_id()
    user = {
        "email": email,
        "password_hash": hash_password(password),
        "name": name,
        "customer_id": customer_id,
        "role": "user",
    }
    db.users.insert_one(user)
    from services.customer_data_service import ensure_customer_collection
    ensure_customer_collection(db, customer_id)
    user.pop("password_hash", None)
    return user


def authenticate_user(db, email: str, password: str) -> Dict[str, Any] | None:
    user = db.users.find_one({"email": email})
    if not user:
        return None
    if not verify_password(password, user.get("password_hash", "")):
        return None
    return user


def authenticate_admin(db, email: str, password: str) -> Dict[str, Any] | None:
    admin = db.admins.find_one({"email": email})
    if not admin:
        return None
    if not verify_password(password, admin.get("password_hash", "")):
        return None
    return admin


def issue_token_for_user(user: Dict[str, Any]) -> str:
    payload = {
        "sub": str(user.get("_id")),
        "email": user.get("email"),
        "role": "user",
        "customer_id": user.get("customer_id"),
    }
    return create_access_token(payload)


def issue_token_for_admin(admin: Dict[str, Any]) -> str:
    payload = {
        "sub": str(admin.get("_id")),
        "email": admin.get("email"),
        "role": "admin",
    }
    if admin.get("customer_id"):
        payload["customer_id"] = admin.get("customer_id")
    return create_access_token(payload)
