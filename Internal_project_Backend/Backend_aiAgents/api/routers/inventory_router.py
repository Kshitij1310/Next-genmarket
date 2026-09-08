from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.database import Database

from core.db import get_db
from core.deps import require_admin
from models.schemas import WarehousesResponse, WarehouseResponse, InventoryItem, InventoryBatchCreateRequest
from services.inventory_service import (
    list_warehouses,
    get_warehouse,
    get_warehouse_products,
    get_sku_inventory,
    recalculate_all_warehouse_utilization,
)
from services.inventory_expiry_service import (
    add_inventory_batch,
    list_grocery_expiry_alerts,
    shortlist_grocery_expiry_alerts,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("/warehouses", response_model=WarehousesResponse)
def warehouses(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> WarehousesResponse:
    """List all warehouses with their products."""
    data = list_warehouses(db)
    warehouses_response = [
        WarehouseResponse(
            warehouse_code=wh["warehouse_code"],
            products=[InventoryItem(**item) for item in wh["products"]],
        )
        for wh in data
    ]
    return WarehousesResponse(warehouses=warehouses_response)


@router.get("/warehouse/{warehouse_code}", response_model=WarehouseResponse)
def warehouse_detail(
    warehouse_code: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> WarehouseResponse:
    """Get warehouse details with products."""
    wh = get_warehouse(db, warehouse_code)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return WarehouseResponse(
        warehouse_code=wh["warehouse_code"],
        products=[InventoryItem(**item) for item in wh["products"]],
    )


@router.get("/warehouse/{warehouse_code}/products", response_model=list[InventoryItem])
def warehouse_products(
    warehouse_code: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[InventoryItem]:
    """Get all products in a specific warehouse."""
    items = get_warehouse_products(db, warehouse_code)
    if not items:
        # Check if warehouse exists
        warehouse = db.warehouses.find_one({"code": warehouse_code}, {"_id": 0})
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        # Warehouse exists but has no products
        return []
    return [InventoryItem(**item) for item in items]


@router.get("/sku/{sku}", response_model=list[InventoryItem])
def sku_inventory(
    sku: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[InventoryItem]:
    """Get inventory for a specific SKU across all warehouses."""
    items = get_sku_inventory(db, sku)
    if not items:
        # Check if SKU exists in catalog
        product = db.catalog.find_one({"sku": sku}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="SKU not found")
        # SKU exists but has no inventory
        return []
    return [InventoryItem(**item) for item in items]


@router.get("/thresholds")
def get_inventory_thresholds(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Get all inventory thresholds from inventory_thresholds collection."""
    rows = list(db.inventory_thresholds.find({}, {"_id": 0}).sort([("warehouse_code", 1), ("sku", 1)]))
    return {"count": len(rows), "items": rows}


@router.get("/thrasholds")
def get_inventory_thrasholds_alias(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Alias for /thresholds (kept for compatibility with typo)."""
    rows = list(db.inventory_thresholds.find({}, {"_id": 0}).sort([("warehouse_code", 1), ("sku", 1)]))
    return {"count": len(rows), "items": rows}


@router.get("/warehouse-capacity")
def get_warehouse_capacity(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Get capacity for each warehouse with category limits."""
    rows = list(
        db.warehouses.find(
            {},
            {
                "_id": 0,
                "code": 1,
                "name": 1,
                "region": 1,
                "capacity_units": 1,
                "current_utilization": 1,
                "category_limits": 1,
                "category_utilization": 1,
            },
        ).sort("code", 1)
    )

    items = []
    for row in rows:
        capacity_units = int(row.get("capacity_units", 0))
        current_utilization = int(row.get("current_utilization", 0))
        category_limits = row.get("category_limits", {}) or {}
        category_utilization = row.get("category_utilization", {}) or {}

        items.append(
            {
                "warehouse_code": row.get("code", ""),
                "warehouse_name": row.get("name", ""),
                "region": row.get("region", ""),
                "capacity_units": capacity_units,
                "current_utilization": current_utilization,
                "remaining_capacity": max(0, capacity_units - current_utilization),
                "category_limits": category_limits,
                "category_utilization": category_utilization,
            }
        )

    return {"count": len(items), "items": items}


@router.post("/warehouse-capacity/recalculate")
def refresh_warehouse_capacity(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Admin-only: recalculate and persist warehouse utilization fields from inventory."""
    return recalculate_all_warehouse_utilization(db)


@router.get("/warehouse-capacity/recalculate")
def refresh_warehouse_capacity_get(
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Admin-only GET alias: recalculate and persist warehouse utilization fields from inventory."""
    return recalculate_all_warehouse_utilization(db)


@router.post("/batch")
def create_inventory_batch(
    req: InventoryBatchCreateRequest,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Add/merge a new inventory batch for grocery item with a single expiry date.
    FEFO uses this data to sell nearest-expiry stock first.
    """
    try:
        result = add_inventory_batch(
            db,
            warehouse_code=req.warehouse_code,
            sku=req.sku,
            quantity=req.quantity,
            expiry_date=req.expiry_date,
            source=req.source,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/expiry-alerts/trigger")
def trigger_grocery_expiry_alerts(
    warehouse_code: str | None = Query(None, description="Optional warehouse code filter, e.g. WH-N"),
    shortlist_weeks: int = Query(7, ge=1, le=52, description="Shortlist groceries expiring within N weeks"),
    sale_trigger_days: int = Query(7, ge=1, le=60, description="Sale starts when <= N days to expiry"),
    persist_alerts: bool = Query(True, description="Store/update records in alert_events"),
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Trigger expiry-alert scan for grocery products by warehouse.
    Returns products within shortlist window and days left before sale trigger.
    """
    try:
        return shortlist_grocery_expiry_alerts(
            db,
            warehouse_code=warehouse_code,
            shortlist_weeks=shortlist_weeks,
            sale_trigger_days=sale_trigger_days,
            persist_alerts=persist_alerts,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/expiry-alerts")
def get_grocery_expiry_alerts(
    warehouse_code: str | None = Query(None, description="Optional warehouse code filter, e.g. WH-S"),
    sale_status: str | None = Query(
        None,
        pattern="^(discount_active|upcoming)$",
        description="Optional sale status filter: discount_active or upcoming",
    ),
    limit: int = Query(200, ge=1, le=1000, description="Maximum alerts to return"),
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """
    Read persisted grocery expiry alerts by warehouse code from alert_events.
    """
    try:
        return list_grocery_expiry_alerts(
            db,
            warehouse_code=warehouse_code,
            sale_status=sale_status,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
