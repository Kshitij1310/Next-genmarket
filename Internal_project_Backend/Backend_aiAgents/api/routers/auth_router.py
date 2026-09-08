from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from core.db import get_db
from models.schemas import SignupRequest, LoginRequest, AuthResponse
from services.auth_service import (
    create_user,
    authenticate_user,
    authenticate_admin,
    issue_token_for_user,
    issue_token_for_admin,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse)
def signup(req: SignupRequest, db: Database = Depends(get_db)) -> AuthResponse:
    try:
        user = create_user(db, req.email, req.password, req.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = issue_token_for_user(user)
    return AuthResponse(access_token=token, role="user", customer_id=user.get("customer_id"))


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Database = Depends(get_db)) -> AuthResponse:
    user = authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = issue_token_for_user(user)
    return AuthResponse(access_token=token, role="user", customer_id=user.get("customer_id"))


@router.post("/admin/login", response_model=AuthResponse)
def admin_login(req: LoginRequest, db: Database = Depends(get_db)) -> AuthResponse:
    admin = authenticate_admin(db, req.email, req.password)
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = issue_token_for_admin(admin)
    return AuthResponse(access_token=token, role="admin", customer_id=admin.get("customer_id"))
