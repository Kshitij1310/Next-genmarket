from __future__ import annotations

from typing import Dict, Any, List
import re


def _detect_intent(message: str) -> str:
    text = message.lower()
    if "order" in text or "shipment" in text or "tracking" in text:
        return "order_status"
    if "price" in text or "cost" in text:
        return "pricing"
    if "inventory" in text or "stock" in text:
        return "inventory"
    return "general_support"


def _retrieve_catalog_context(db, message: str, limit: int = 3) -> List[Dict[str, Any]]:
    if db is None:
        return []
    query = message.strip()
    if not query:
        return []
    try:
        tokens = [t for t in re.split(r"[^A-Za-z0-9-]+", query) if len(t) >= 3]
        search_terms = tokens[:6] if tokens else [query]
        escaped = "|".join(re.escape(t) for t in search_terms)
        results = list(
            db.catalog.find(
                {
                    "$or": [
                        {"name": {"$regex": escaped, "$options": "i"}},
                        {"description": {"$regex": escaped, "$options": "i"}},
                        {"sku": {"$regex": escaped, "$options": "i"}},
                        {"category": {"$regex": escaped, "$options": "i"}},
                        {"attributes.brand": {"$regex": escaped, "$options": "i"}},
                    ]
                },
                {"_id": 0},
            ).limit(limit)
        )
        return results
    except Exception:
        return []


def _format_product_reply(item: Dict[str, Any]) -> str:
    name = item.get("name", "")
    sku = item.get("sku", "")
    description = item.get("description", "")
    price = item.get("price", 0)
    currency = item.get("currency", "USD")
    attrs = item.get("attributes", {}) or {}
    brand = attrs.get("brand", "")
    image_url = item.get("image_url", "")

    parts = [f"{name} ({sku})", description]
    if brand:
        parts.append(f"Brand: {brand}")
    parts.append(f"Price: {price} {currency}")
    if image_url:
        parts.append(f"Image: {image_url}")
    return " | ".join([p for p in parts if p])


def handle_chat(db, message: str) -> Dict[str, Any]:
    intent = _detect_intent(message)
    context = _retrieve_catalog_context(db, message)

    if context and intent not in ("order_status", "inventory"):
        reply = _format_product_reply(context[0])
        intent = "product_info"
        confidence = 0.94
    elif intent == "order_status":
        reply = "Your order is currently in transit."
        confidence = 0.93
    elif intent == "pricing":
        reply = "Pricing varies by product; please check the product page."
        confidence = 0.9
    elif intent == "inventory":
        reply = "Stock levels are being updated in real time."
        confidence = 0.9
    else:
        reply = "How can I help you today?"
        confidence = 0.8

    return {
        "reply": reply,
        "intent": intent,
        "confidence": confidence,
        "context": context,
    }
