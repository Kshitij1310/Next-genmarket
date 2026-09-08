from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Dict, Any


def _enrich_with_price(db, item: Dict[str, Any], transformed: Dict[str, Any]) -> None:
    """Add price/currency from catalog to inventory item."""
    prod = db.catalog.find_one({"sku": item.get("sku")}, {"_id": 0})
    if prod:
        transformed["price"] = float(prod.get("price") or prod.get("attributes", {}).get("price", 0))
        transformed["currency"] = str(prod.get("currency") or prod.get("attributes", {}).get("currency", "USD"))
    else:
        transformed["price"] = 0.0
        transformed["currency"] = "USD"


def _enrich_with_expiry(item: Dict[str, Any], transformed: Dict[str, Any]) -> None:
    expiry = item.get("expiry_date")
    if isinstance(expiry, str):
        try:
            expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        except Exception:
            expiry = None
    if isinstance(expiry, datetime):
        transformed["expiry_date"] = expiry if expiry.tzinfo else expiry.replace(tzinfo=timezone.utc)
        transformed["days_to_expiry"] = (transformed["expiry_date"].date() - datetime.now(timezone.utc).date()).days


def list_warehouses(db) -> List[Dict[str, Any]]:
    """List all warehouses with their products from MongoDB."""
    try:
        # Get all warehouses
        warehouses = list(db.warehouses.find({}, {"_id": 0}))
        warehouse_map = {wh["code"]: wh for wh in warehouses}
        
        # Get all inventory items grouped by warehouse
        inventory_items = list(db.inventory_by_warehouse.find({}, {"_id": 0}))
        
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for item in inventory_items:
            wh_code = item.get("warehouse_code")
            if wh_code:
                transformed = {
                    "warehouse_code": wh_code,
                    "sku": item.get("sku", ""),
                    "quantity": int(item.get("qty", 0)),
                    "category": item.get("category", ""),
                    "brand": item.get("brand", item.get("product_name", "")),
                    "bin_location": item.get("metadata", {}).get("bin", "") if isinstance(item.get("metadata"), dict) else "",
                }
                _enrich_with_price(db, item, transformed)
                _enrich_with_expiry(item, transformed)
                grouped.setdefault(wh_code, []).append(transformed)
        
        # Return warehouses in sorted order
        result = []
        for wh_code in sorted(grouped.keys()):
            wh_info = warehouse_map.get(wh_code, {})
            result.append({
                "warehouse_code": wh_code,
                "warehouse_name": wh_info.get("name", wh_code),
                "region": wh_info.get("region", ""),
                "products": grouped[wh_code],
            })
        
        return result
    except Exception:
        return []


def get_warehouse(db, warehouse_code: str) -> Dict[str, Any] | None:
    """Get warehouse details with products."""
    try:
        # Get warehouse info
        warehouse = db.warehouses.find_one({"code": warehouse_code}, {"_id": 0})
        if not warehouse:
            return None
        
        # Get inventory items for this warehouse
        inventory_items = list(db.inventory_by_warehouse.find({"warehouse_code": warehouse_code}, {"_id": 0}))
        
        products = []
        for item in inventory_items:
            transformed = {
                "warehouse_code": warehouse_code,
                "sku": item.get("sku", ""),
                "quantity": int(item.get("qty", 0)),
                "category": item.get("category", ""),
                "brand": item.get("brand", item.get("product_name", "")),
                "bin_location": item.get("metadata", {}).get("bin", "") if isinstance(item.get("metadata"), dict) else "",
            }
            _enrich_with_price(db, item, transformed)
            _enrich_with_expiry(item, transformed)
            products.append(transformed)
        
        return {
            "warehouse_code": warehouse_code,
            "warehouse_name": warehouse.get("name", warehouse_code),
            "region": warehouse.get("region", ""),
            "products": products,
        }
    except Exception:
        return None


def get_warehouse_products(db, warehouse_code: str) -> List[Dict[str, Any]]:
    """Get all products in a specific warehouse."""
    try:
        inventory_items = list(db.inventory_by_warehouse.find({"warehouse_code": warehouse_code}, {"_id": 0}))
        products = []
        for item in inventory_items:
            transformed = {
                "warehouse_code": warehouse_code,
                "sku": item.get("sku", ""),
                "quantity": int(item.get("qty", 0)),
                "category": item.get("category", ""),
                "brand": item.get("brand", item.get("product_name", "")),
                "bin_location": item.get("metadata", {}).get("bin", "") if isinstance(item.get("metadata"), dict) else "",
            }
            _enrich_with_price(db, item, transformed)
            _enrich_with_expiry(item, transformed)
            products.append(transformed)
        return products
    except Exception:
        return []


def get_sku_inventory(db, sku: str) -> List[Dict[str, Any]]:
    """Get inventory for a specific SKU across all warehouses."""
    try:
        inventory_items = list(db.inventory_by_warehouse.find({"sku": sku}, {"_id": 0}))
        products = []
        for item in inventory_items:
            transformed = {
                "warehouse_code": item.get("warehouse_code", ""),
                "sku": sku,
                "quantity": int(item.get("qty", 0)),
                "category": item.get("category", ""),
                "brand": item.get("brand", item.get("product_name", "")),
                "bin_location": item.get("metadata", {}).get("bin", "") if isinstance(item.get("metadata"), dict) else "",
            }
            _enrich_with_price(db, item, transformed)
            _enrich_with_expiry(item, transformed)
            products.append(transformed)
        return products
    except Exception:
        return []


def recalculate_warehouse_utilization(db, warehouse_code: str) -> Dict[str, Any]:
    """
    Recalculate and persist warehouse current/category utilization from inventory_by_warehouse.
    Returns the computed utilization payload.
    """
    try:
        rows = list(
            db.inventory_by_warehouse.find(
                {"warehouse_code": warehouse_code},
                {"_id": 0, "qty": 1, "category": 1},
            )
        )

        category_utilization: Dict[str, int] = {}
        total = 0
        for row in rows:
            qty = int(row.get("qty", 0))
            if qty < 0:
                qty = 0
            total += qty
            category = str(row.get("category", "") or "").strip().lower()
            if category:
                category_utilization[category] = category_utilization.get(category, 0) + qty

        db.warehouses.update_one(
            {"code": warehouse_code},
            {
                "$set": {
                    "current_utilization": total,
                    "category_utilization": category_utilization,
                }
            },
            upsert=False,
        )

        warehouse = db.warehouses.find_one({"code": warehouse_code}, {"_id": 0, "capacity_units": 1})
        capacity_units = int((warehouse or {}).get("capacity_units", 0))

        return {
            "warehouse_code": warehouse_code,
            "current_utilization": total,
            "category_utilization": category_utilization,
            "capacity_units": capacity_units,
            "remaining_capacity": max(0, capacity_units - total),
        }
    except Exception:
        return {
            "warehouse_code": warehouse_code,
            "current_utilization": 0,
            "category_utilization": {},
            "capacity_units": 0,
            "remaining_capacity": 0,
        }


def recalculate_all_warehouse_utilization(db) -> Dict[str, Any]:
    """Recalculate utilization for all warehouses and persist it."""
    try:
        warehouses = list(db.warehouses.find({}, {"_id": 0, "code": 1}).sort("code", 1))
    except Exception:
        return {"count": 0, "items": []}

    items: List[Dict[str, Any]] = []
    for wh in warehouses:
        code = wh.get("code")
        if not code:
            continue
        items.append(recalculate_warehouse_utilization(db, str(code)))

    return {"count": len(items), "items": items}
