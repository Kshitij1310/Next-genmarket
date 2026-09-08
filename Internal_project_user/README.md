# Supply Chain POC Backend

FastAPI backend with modular services for supply chain catalog, inventory, orders, tracking, payments, and AI ops.
The active backend lives in `Backend_aiAgents/`.

## Quick start

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r Backend_aiAgents/requirements.txt
cd .\Backend_aiAgents
uvicorn main:app --reload
```

## Structure

- `Backend_aiAgents/api/` FastAPI app and routers
- `Backend_aiAgents/core/` configuration, logging, security
- `Backend_aiAgents/models/` Pydantic schemas
- `Backend_aiAgents/services/` business logic (catalog, inventory, orders, payments, chat)
- `Backend_aiAgents/scripts/` admin/seed scripts

## Notes

- Mongo connection: set `MONGO_URI` and `MONGO_DB` in `Backend_aiAgents/.env`.
- JWT settings: `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXP_MINUTES`.
- Stripe (optional): set `STRIPE_SECRET_KEY`. Webhooks require `STRIPE_WEBHOOK_SECRET`.
- Start ngrok for Stripe webhooks and use:
  - `https://<ngrok-id>.ngrok-free.app/api/webhooks/stripe`

## Auth

- `POST /api/auth/signup` (user)
- `POST /api/auth/login` (user)
- `POST /api/auth/admin/login` (admin)

Use `Authorization: Bearer <token>` for protected endpoints.
