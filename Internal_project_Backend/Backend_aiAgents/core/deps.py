from __future__ import annotations

from typing import Dict, Any

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from core.security import decode_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

    role = payload.get("role")
    if role not in {"admin", "user"}:
        raise HTTPException(status_code=401, detail="Invalid token role")

    return payload


def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
