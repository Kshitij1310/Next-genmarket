# NexChain Marketplace

An AI-driven supply-chain marketplace: a FastAPI backend with LangGraph AI agents, plus two React frontends — an **Admin** console and a **Customer** storefront.

## Repository Layout

| Folder | What it is | Stack |
| --- | --- | --- |
| `Internal_project_Backend/Backend_aiAgents` | REST + WebSocket API, AI agents, business services | FastAPI, MongoDB, LangGraph, Stripe, web3 |
| `Internal_project/Frontend_admin` | Admin panel (internal operations) | React 19, Vite, Tailwind, React Router |
| `Internal_project_user/Frontend_User` | Customer-facing storefront | React 19, Vite, Tailwind, Zustand, React Query, Recharts, ethers |

## Backend

`Backend_aiAgents` exposes routers for products, inventory, cart, orders, tracking, payments, chat, reorder, auth, profile, customer data, notifications (incl. WebSocket), AI-ops, and Stripe webhooks.

- `agents/` — LangGraph agents: catalog, inventory, reorder, shipment, payment, customer, aiops.
- `services/` — domain logic: orders, payments, blockchain, demand forecast (XGBoost), expiry checks, RAG, LLM, email/notifications.
- `core/` — config, Mongo connection, JWT security, WebSocket hub, background reorder scheduler.

Run:

```bash
cd Internal_project_Backend/Backend_aiAgents
pip install -r requirements.txt
uvicorn main:app --reload      # docs at /docs
```

Configuration comes from `.env`: `MONGO_URI`, `MONGO_DB`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `SMTP_*`, `WEB3_PROVIDER_URL`, `BLOCKCHAIN_ENABLED`, `REORDER_ENABLED`.

## Admin Panel (short)

The admin app (`Internal_project/Frontend_admin`) is the internal control room. Login is role-gated — only `admin` users reach `/admin/*`, which renders inside a shared layout (sidebar + navbar + live notifications).

Pages under `/admin`:

- **Dashboard** — KPIs and overall marketplace health.
- **Products** — create, edit, and list catalog items.
- **Inventory** — stock levels and adjustments.
- **Reorder** — automatic/manual restock suggestions from the reorder agent.
- **Order Management** — view, update, and fulfil customer orders.
- **Expiry Alerts** — items nearing expiry.
- **Tracking** — shipment status per order.
- **Payments / Revenue Details** — Stripe payments, refunds, revenue breakdown.
- **AI Chat** — chat with the AI-ops agent about inventory, orders, and demand.
- **Settings** — account and app preferences.

Each page talks to the backend through a thin service layer in `src/services/` (`adminService`, `inventoryService`, `orderService`, `productService`, `reorderService`, `revenueService`, `trackingService`, `notificationService`, `dashboardService`) built on a shared `api.js` client.

Run:

```bash
cd Internal_project/Frontend_admin
npm install
npm run dev
```

## Customer Frontend

`Internal_project_user/Frontend_User` — signup/login, product browsing, cart, checkout via Stripe, order history, shipment tracking, payments, AI chat assistant, and settings.

```bash
cd Internal_project_user/Frontend_User
npm install
npm run dev
```

## Typical Flow

1. Customer browses products, adds to cart, pays via Stripe.
2. Stripe webhook confirms payment; the order service creates the order and (optionally) anchors it on-chain.
3. Inventory drops; the reorder scheduler and demand-forecast service flag restocks.
4. Admin monitors and acts on everything from the admin panel; notifications stream live over WebSocket.
