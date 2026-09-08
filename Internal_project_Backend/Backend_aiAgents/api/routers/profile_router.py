from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user
from core.security import hash_password
from models.schemas import ProfileUpdateRequest, ProfileResponse

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
def get_profile(
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ProfileResponse:
    collection = db.users if user.get("role") == "user" else db.admins
    doc = collection.find_one({"email": user.get("email")}, {"_id": 0, "password_hash": 0}) or {}
    return ProfileResponse(
        name=doc.get("name"),
        email=doc.get("email"),
        role=user.get("role"),
        customer_id=doc.get("customer_id"),
        theme=doc.get("theme"),
        density=doc.get("density"),
        default_warehouse=doc.get("default_warehouse"),
        enable_ai_reorder=doc.get("enable_ai_reorder"),
        enable_notifications=doc.get("enable_notifications"),
    )


@router.put("", response_model=ProfileResponse)
def update_profile(
    req: ProfileUpdateRequest,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> ProfileResponse:
    collection = db.users if user.get("role") == "user" else db.admins
    updates: dict = {}

    if req.name is not None:
        updates["name"] = req.name
    if req.email is not None:
        # prevent email collision
        if collection.find_one({"email": req.email, "email": {"$ne": user.get("email")}}):
            raise HTTPException(status_code=400, detail="Email already in use")
        updates["email"] = req.email
    if req.password:
        updates["password_hash"] = hash_password(req.password)
    if req.theme is not None:
        updates["theme"] = req.theme
    if req.density is not None:
        updates["density"] = req.density
    if req.default_warehouse is not None:
        updates["default_warehouse"] = req.default_warehouse
    if req.enable_ai_reorder is not None:
        updates["enable_ai_reorder"] = req.enable_ai_reorder
    if req.enable_notifications is not None:
        updates["enable_notifications"] = req.enable_notifications

    if updates:
        collection.update_one({"email": user.get("email")}, {"$set": updates})

    doc = collection.find_one({"email": updates.get("email", user.get("email"))}, {"_id": 0, "password_hash": 0}) or {}
    return ProfileResponse(
        name=doc.get("name"),
        email=doc.get("email"),
        role=user.get("role"),
        customer_id=doc.get("customer_id"),
        theme=doc.get("theme"),
        density=doc.get("density"),
        default_warehouse=doc.get("default_warehouse"),
        enable_ai_reorder=doc.get("enable_ai_reorder"),
        enable_notifications=doc.get("enable_notifications"),
    )
