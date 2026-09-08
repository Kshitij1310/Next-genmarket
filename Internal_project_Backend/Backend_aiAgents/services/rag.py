from __future__ import annotations

from typing import List, Dict

from core.db import get_db


def retrieve_product_info(query: str, top_k: int = 3) -> List[Dict[str, str]]:
    """Retrieve product info from catalog collection using simple text search."""
    try:
        db = get_db()
        q = query.lower().strip()
        
        # Search in catalog collection
        products = list(db.catalog.find({}, {"_id": 0}))
        
        matches = []
        for p in products:
            name = str(p.get("name", "")).lower()
            desc = str(p.get("description", "")).lower()
            sku = str(p.get("sku", "")).lower()
            category = str(p.get("category", "")).lower()
            
            if q in name or q in desc or q in sku or q in category:
                matches.append({
                    "sku": p.get("sku", ""),
                    "name": p.get("name", ""),
                    "description": p.get("description", ""),
                })
        
        return matches[:top_k] if matches else products[:top_k]
    except Exception:
        # Fallback to empty list if DB query fails
        return []


def format_context(items: List[Dict[str, str]]) -> str:
    """Format product context for LLM."""
    lines = [f"- {i['sku']}: {i['name']} — {i['description']}" for i in items]
    return "\n".join(lines)
