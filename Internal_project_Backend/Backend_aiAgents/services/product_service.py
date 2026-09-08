from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple

from core.db import get_db
from services.inventory_expiry_service import get_nearest_expiry


def _apply_near_expiry_discount(db, item: Dict[str, Any]) -> None:
    if str(item.get("category", "")).lower() != "grocery":
        return

    nearest_expiry = get_nearest_expiry(db, item.get("sku", ""))
    if not nearest_expiry:
        return

    now = datetime.now(timezone.utc)
    days_to_expiry = (nearest_expiry.date() - now.date()).days
    item["nearest_expiry_date"] = nearest_expiry
    item["days_to_expiry"] = days_to_expiry

    if days_to_expiry <= 7:
        original_price = float(item.get("price", 0))
        discounted_price = round(original_price * 0.85, 2)
        item["original_price"] = original_price
        item["price"] = discounted_price
        item["discount_percent"] = 15
        item["discount_active"] = True


def _load_products(db) -> List[Dict[str, Any]]:
    """Load products from catalog collection."""
    try:
        items = list(db.catalog.find({}, {"_id": 0}))
        # Enrich with inventory data
        for item in items:
            sku = item.get("sku")
            if sku:
                # Calculate total stock from inventory_by_warehouse
                inventory_items = list(db.inventory_by_warehouse.find({"sku": sku}, {"_id": 0}))
                total_stock = sum(int(inv.get("qty", 0)) for inv in inventory_items)
                warehouse_distribution = {
                    inv.get("warehouse_code"): int(inv.get("qty", 0))
                    for inv in inventory_items
                    if inv.get("warehouse_code")
                }
                item["total_stock"] = total_stock
                item["warehouse_distribution"] = warehouse_distribution
                # Map catalog fields to expected product fields
                # Ensure required fields exist with defaults
                if "price" not in item:
                    attrs = item.get("attributes", {})
                    if isinstance(attrs, dict) and "price" in attrs:
                        item["price"] = float(attrs.get("price", 0))
                    else:
                        item["price"] = 0.0
                else:
                    item["price"] = float(item.get("price", 0))
                
                if "brand" not in item:
                    attrs = item.get("attributes", {})
                    if isinstance(attrs, dict) and "brand" in attrs:
                        item["brand"] = str(attrs.get("brand", ""))
                    else:
                        item["brand"] = ""
                
                if "currency" not in item:
                    attrs = item.get("attributes", {})
                    if isinstance(attrs, dict) and "currency" in attrs:
                        item["currency"] = str(attrs.get("currency", "USD"))
                    else:
                        item["currency"] = "USD"
                _apply_near_expiry_discount(db, item)
        return items
    except Exception:
        return []


def get_products(db, page: int, page_size: int) -> Tuple[List[Dict[str, Any]], int]:
    items = _load_products(db)
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    return items[start:end], total


def get_product(db, sku: str) -> Dict[str, Any] | None:
    """Get product by SKU from catalog collection."""
    try:
        item = db.catalog.find_one({"sku": sku}, {"_id": 0})
        if item:
            # Enrich with inventory data
            inventory_items = list(db.inventory_by_warehouse.find({"sku": sku}, {"_id": 0}))
            total_stock = sum(int(inv.get("qty", 0)) for inv in inventory_items)
            warehouse_distribution = {
                inv.get("warehouse_code"): int(inv.get("qty", 0))
                for inv in inventory_items
                if inv.get("warehouse_code")
            }
            item["total_stock"] = total_stock
            item["warehouse_distribution"] = warehouse_distribution
            # Map attributes to top-level fields if needed
            # Ensure required fields exist with defaults
            if "price" not in item:
                attrs = item.get("attributes", {})
                if isinstance(attrs, dict) and "price" in attrs:
                    item["price"] = float(attrs.get("price", 0))
                else:
                    item["price"] = 0.0
            else:
                item["price"] = float(item.get("price", 0))
            
            if "brand" not in item:
                attrs = item.get("attributes", {})
                if isinstance(attrs, dict) and "brand" in attrs:
                    item["brand"] = str(attrs.get("brand", ""))
                else:
                    item["brand"] = ""
            
            if "currency" not in item:
                attrs = item.get("attributes", {})
                if isinstance(attrs, dict) and "currency" in attrs:
                    item["currency"] = str(attrs.get("currency", "USD"))
                else:
                    item["currency"] = "USD"
            _apply_near_expiry_discount(db, item)
            return item
    except Exception:
        pass
    return None


def search_products(db, query: str) -> List[Dict[str, Any]]:
    """Search products in catalog collection."""
    items = _load_products(db)
    q = query.lower().strip()
    results: List[Dict[str, Any]] = []

    for item in items:
        name = str(item.get("name", "")).lower()
        desc = str(item.get("description", "")).lower()
        brand = str(item.get("brand", "")).lower()
        category = str(item.get("category", "")).lower()
        sku = str(item.get("sku", "")).lower()

        score = 0.2
        if q in name:
            score = 0.95
        elif q in sku:
            score = 0.9
        elif q in brand:
            score = 0.85
        elif q in category:
            score = 0.8
        elif q in desc:
            score = 0.7

        if q in name or q in desc or q in brand or q in category or q in sku:
            results.append({"product": item, "relevance_score": round(score, 2)})

    if not results:
        # Return top 5 products if no match
        for item in items[:5]:
            results.append({"product": item, "relevance_score": 0.5})

    return results
