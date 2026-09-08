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

### Frontend configuration

The React/Vite frontend reads the backend base URL from
the `VITE_API_URL` environment variable. During development you can
set this in a `.env` file inside `Frontend_admin/` or export the variable
before running `npm run dev`:

```bash
# Frontend_admin/.env
VITE_API_URL=http://localhost:8000
```

Without the variable the app falls back to `http://127.0.0.1:8000`.
Ensure the value matches the address where your backend is listening,
otherwise images and API requests will fail with the placeholder shown above.

## Auth

- `POST /api/auth/signup` (user)
- `POST /api/auth/login` (user)
- `POST /api/auth/admin/login` (admin)

Use `Authorization: Bearer <token>` for protected endpoints.
