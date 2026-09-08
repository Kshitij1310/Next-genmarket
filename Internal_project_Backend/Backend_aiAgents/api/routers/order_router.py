from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user, require_admin
from models.schemas import (
    DeliveredOrderLineItem,
    DeliveredWarehouseOrder,
    OrderCreateRequest,
    OrderCreateResponse,
    OrderDetailResponse,
    WarehouseDeliveredOrdersResponse,
    WarehouseRevenueResponse,
)
from services.order_service import create_order, get_order, confirm_cod_payment

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _resolve_items(req: OrderCreateRequest) -> list[dict]:
    """Build items list from request (multi-item or single sku/quantity)."""
    if req.items:
        return [{"sku": i.sku, "quantity": i.quantity} for i in req.items]
    if not req.sku or req.quantity is None:
        raise HTTPException(status_code=400, detail="sku and quantity are required when items are not provided")
    return [{"sku": req.sku, "quantity": req.quantity}]


def _build_delivered_orders_data(db: Database, warehouse_code: str) -> dict:
    shipments = list(
        db.shipments.find(
            {"warehouse_code": warehouse_code, "status": "delivered"},
            {"_id": 0, "shipment_id": 1, "warehouse_code": 1, "delivered_at": 1},
        )
    )

    delivered_orders: list[DeliveredWarehouseOrder] = []
    stripe_revenue_usd = 0.0
    cod_revenue_usd = 0.0
    eligible_count = 0

    for shipment in shipments:
        shipment_id = shipment.get("shipment_id")
        if not shipment_id:
            continue

        order = db.orders.find_one({"shipment_id": shipment_id}, {"_id": 0})
        if not order:
            continue

        order_id = order.get("order_id")
        if not order_id:
            continue

        ordered_products = list(
            db.ordered_products.find(
                {"order_id": order_id},
                {"_id": 0, "sku": 1, "product_name": 1, "quantity": 1, "unit_price": 1},
            )
        )

        items: list[DeliveredOrderLineItem] = []
        total_amount_usd = 0.0

        if ordered_products:
            for op in ordered_products:
                qty = int(op.get("quantity", 0) or 0)
                unit_price = float(op.get("unit_price", 0.0) or 0.0)
                line_total = round(qty * unit_price, 2)
                total_amount_usd += line_total
                items.append(
                    DeliveredOrderLineItem(
                        sku=op.get("sku", ""),
                        product_name=op.get("product_name", op.get("sku", "")),
                        quantity=qty,
                        unit_price_usd=round(unit_price, 2),
                        line_total_usd=line_total,
                    )
                )
        else:
            # Legacy fallback when ordered_products snapshot is unavailable.
            for it in order.get("items", []):
                sku = it.get("sku", "")
                qty = int(it.get("quantity", 0) or 0)
                prod = db.catalog.find_one({"sku": sku}, {"_id": 0, "name": 1, "price": 1})
                unit_price = float((prod or {}).get("price", 0.0) or 0.0)
                line_total = round(qty * unit_price, 2)
                total_amount_usd += line_total
                items.append(
                    DeliveredOrderLineItem(
                        sku=sku,
                        product_name=(prod or {}).get("name", sku),
                        quantity=qty,
                        unit_price_usd=round(unit_price, 2),
                        line_total_usd=line_total,
                    )
                )

        total_amount_usd = round(total_amount_usd, 2)
        payment_method = str(order.get("payment_method", "cash_on_delivery")).lower()
        payment_status = str(order.get("payment_status", "pending")).lower()
        included_in_revenue = False
        exclusion_reason = None

        if payment_method == "stripe":
            included_in_revenue = True
            stripe_revenue_usd += total_amount_usd
        elif payment_method == "cash_on_delivery":
            if payment_status in {"confirmed", "completed"}:
                included_in_revenue = True
                cod_revenue_usd += total_amount_usd
            else:
                exclusion_reason = "COD payment is not yet confirmed"
        else:
            exclusion_reason = f"Payment method '{payment_method}' is not counted in Stripe/COD revenue"

        if included_in_revenue:
            eligible_count += 1

        delivered_orders.append(
            DeliveredWarehouseOrder(
                order_id=order_id,
                shipment_id=shipment_id,
                customer_id=order.get("customer_id", ""),
                warehouse_code=shipment.get("warehouse_code", warehouse_code),
                status=str(order.get("status", "confirmed")),
                payment_method=payment_method,
                payment_status=payment_status,
                created_at=order.get("created_at"),
                delivered_at=shipment.get("delivered_at"),
                included_in_revenue=included_in_revenue,
                revenue_exclusion_reason=exclusion_reason,
                total_amount_usd=total_amount_usd,
                items=items,
            )
        )

    stripe_revenue_usd = round(stripe_revenue_usd, 2)
    cod_revenue_usd = round(cod_revenue_usd, 2)
    total_revenue_usd = round(stripe_revenue_usd + cod_revenue_usd, 2)

    delivered_orders.sort(
        key=lambda o: o.delivered_at or o.created_at,
        reverse=True,
    )

    return {
        "orders": delivered_orders,
        "delivered_orders_count": len(delivered_orders),
        "revenue_eligible_orders_count": eligible_count,
        "stripe_revenue_usd": stripe_revenue_usd,
        "cod_revenue_usd": cod_revenue_usd,
        "total_revenue_usd": total_revenue_usd,
    }


@router.post("", response_model=OrderCreateResponse)
def create(
    req: OrderCreateRequest,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> OrderCreateResponse:
    items = _resolve_items(req)
    role = user.get("role")
    # Admin self-orders must always use admin's own customer_id from token.
    if role == "admin":
        customer_id = user.get("customer_id")
    elif role == "user":
        customer_id = user.get("customer_id")
    else:
        customer_id = req.customer_id or user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required")

    result = create_order(
        db,
        items=items,
        customer_id=customer_id,
        payment_method=req.payment_method,
        payment_completed=req.payment_completed,
        tx_hash=req.tx_hash,
        stripe_payment_id=req.stripe_payment_id,
        stripe_session_id=req.stripe_session_id,
    )

    return OrderCreateResponse(
        order_id=result.get("order_id"),
        cart_id=result.get("cart_id"),
        status=result["status"],
        allocated_warehouse=result.get("allocated_warehouse"),
        shipment_id=result.get("shipment_id"),
        created_at=result.get("created_at"),
        payment_method=result.get("payment_method"),
        payment_id=result.get("payment_id"),
        message=result.get("message", ""),
        stripe_session_id=result.get("stripe_session_id"),
    )


@router.get("/all_orders", response_model=list[OrderDetailResponse])
def list_orders(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[OrderDetailResponse]:
    """Admin-only: list all orders."""
    orders = list(db.orders.find({}, {"_id": 0}).sort("created_at", -1))
    result: list[OrderDetailResponse] = []
    for order in orders:
        items = order.get("items")
        if items:
            sku = items[0]["sku"] if items else ""
            quantity = sum(i.get("quantity", 0) for i in items)
        else:
            sku = order.get("sku", "")
            quantity = int(order.get("quantity", 0))

        payment_method = order.get("payment_method")
        payment_id = order.get("stripe_payment_id") or order.get("tx_hash")

        result.append(
            OrderDetailResponse(
                order_id=order.get("order_id", ""),
                sku=sku,
                quantity=quantity,
                customer_id=order.get("customer_id", ""),
                status=order.get("status", "pending"),
                allocated_warehouse=order.get("allocated_warehouse", ""),
                shipment_id=order.get("shipment_id", ""),
                payment_status=order.get("payment_status", "pending"),
                created_at=order.get("created_at"),
                payment_method=payment_method,
                payment_id=payment_id,
                stripe_payment_id=order.get("stripe_payment_id"),
                stripe_session_id=order.get("stripe_session_id"),
            )
        )
    return result


@router.get(
    "/admin/warehouses/{warehouse_code}/revenue",
    response_model=WarehouseRevenueResponse,
)
def warehouse_revenue(
    warehouse_code: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> WarehouseRevenueResponse:
    payload = _build_delivered_orders_data(db, warehouse_code)
    return WarehouseRevenueResponse(
        warehouse_code=warehouse_code,
        delivered_orders_count=payload["delivered_orders_count"],
        revenue_eligible_orders_count=payload["revenue_eligible_orders_count"],
        stripe_revenue_usd=payload["stripe_revenue_usd"],
        cod_revenue_usd=payload["cod_revenue_usd"],
        total_revenue_usd=payload["total_revenue_usd"],
        currency="USD",
    )


@router.get(
    "/admin/warehouses/{warehouse_code}/delivered-orders",
    response_model=WarehouseDeliveredOrdersResponse,
)
def warehouse_delivered_orders(
    warehouse_code: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> WarehouseDeliveredOrdersResponse:
    payload = _build_delivered_orders_data(db, warehouse_code)
    return WarehouseDeliveredOrdersResponse(
        warehouse_code=warehouse_code,
        delivered_orders_count=payload["delivered_orders_count"],
        revenue_eligible_orders_count=payload["revenue_eligible_orders_count"],
        stripe_revenue_usd=payload["stripe_revenue_usd"],
        cod_revenue_usd=payload["cod_revenue_usd"],
        total_revenue_usd=payload["total_revenue_usd"],
        currency="USD",
        orders=payload["orders"],
    )


@router.get("/{order_id}", response_model=OrderDetailResponse)
def detail(
    order_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> OrderDetailResponse:
    order = get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user.get("role") == "user" and order.get("customer_id") != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Backward compat: old orders have sku/quantity at top level
    items = order.get("items")
    if items:
        sku = items[0]["sku"] if items else ""
        quantity = sum(i.get("quantity", 0) for i in items)
    else:
        sku = order.get("sku", "")
        quantity = int(order.get("quantity", 0))

    payment_method = order.get("payment_method")
    payment_id = order.get("stripe_payment_id") or order.get("tx_hash")

    return OrderDetailResponse(
        order_id=order["order_id"],
        sku=sku,
        quantity=quantity,
        customer_id=order["customer_id"],
        status=order["status"],
        allocated_warehouse=order["allocated_warehouse"],
        shipment_id=order.get("shipment_id", ""),
        payment_status=order.get("payment_status", "pending"),
        created_at=order.get("created_at"),
        payment_method=payment_method,
        payment_id=payment_id,
        stripe_payment_id=order.get("stripe_payment_id"),
        stripe_session_id=order.get("stripe_session_id"),
    )


@router.post("/{order_id}/cod/confirm")
def confirm_cod(
    order_id: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Admin-only: confirm COD payment by order_id."""
    try:
        order = confirm_cod_payment(db, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "order_id": order.get("order_id"),
        "payment_method": order.get("payment_method"),
        "payment_status": order.get("payment_status", "pending"),
        "message": "COD payment confirmed",
    }
