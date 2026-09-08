"""
Load seed data into supplychain DB: catalog, inventory_by_warehouse, warehouses.
Uses core.config (mongo_uri, mongo_db). Run from project root: python scripts/seed_mongo.py
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pymongo import MongoClient

DATA = ROOT / "data"


def load_json_array(filepath: Path):
    import json
    text = filepath.read_text(encoding="utf-8")
    data = json.loads(text)
    return data


def main():
    from core.config import settings

    # Show where we're writing (mask password)
    db_name = settings.mongo_db
    uri = settings.mongo_uri
    if ("localhost" in uri or "127.0.0.1" in uri) and not (ROOT / ".env").exists():
        print("Using default localhost. To use Atlas: copy .env.example to .env and set MONGO_URI to your Atlas URI.")
    if "@" in uri and "://" in uri:
        parts = uri.split("@", 1)
        if ":" in parts[0]:
            user_part = parts[0].split(":", 1)[0]
            masked = f"{uri.split('://')[0]}://{user_part}:****@{parts[1]}"
        else:
            masked = uri
    else:
        masked = uri
    print(f"Target: DB = {db_name!r}, URI = {masked}")

    client = MongoClient(settings.mongo_uri)
    db = client[db_name]

    # Convert $date in JSON to datetime for PyMongo
    def fix_dates(doc):
        if isinstance(doc, dict) and "$date" in doc and len(doc) == 1:
            return datetime.fromisoformat(doc["$date"].replace("Z", "+00:00"))
        if isinstance(doc, dict):
            return {k: fix_dates(v) for k, v in doc.items()}
        if isinstance(doc, list):
            return [fix_dates(x) for x in doc]
        return doc

    catalog_path = DATA / "seed_catalog.json"
    inv_path = DATA / "seed_inventory_by_warehouse.json"
    warehouses_path = DATA / "seed_warehouses.json"
    dealers_path = DATA / "seed_dealers.json"
    thresholds_path = DATA / "seed_inventory_thresholds.json"

    if warehouses_path.exists():
        warehouses = load_json_array(warehouses_path)
        for w in warehouses:
            db.warehouses.update_one({"code": w["code"]}, {"$set": w}, upsert=True)
        print(f"Upserted {len(warehouses)} warehouse documents.")
    else:
        print(f"Not found: {warehouses_path}")

    if catalog_path.exists():
        catalog = load_json_array(catalog_path)
        for c in catalog:
            db.catalog.update_one({"sku": c["sku"]}, {"$set": c}, upsert=True)
        print(f"Upserted {len(catalog)} catalog documents.")
    else:
        print(f"Not found: {catalog_path}")

    if inv_path.exists():
        inv = load_json_array(inv_path)
        inv = [fix_dates(d) for d in inv]
        for d in inv:
            db.inventory_by_warehouse.update_one(
                {"sku": d["sku"], "warehouse_code": d["warehouse_code"]},
                {"$set": {**d, "updated_at": d.get("updated_at") or datetime.now(timezone.utc)}},
                upsert=True,
            )
        print(f"Upserted {len(inv)} inventory_by_warehouse documents.")
    else:
        print(f"Not found: {inv_path}")

    if dealers_path.exists():
        dealers = load_json_array(dealers_path)
        for d in dealers:
            db.dealers.update_one(
                {"warehouse_code": d["warehouse_code"], "dealer_priority": d["dealer_priority"]},
                {"$set": d},
                upsert=True,
            )
        print(f"Upserted {len(dealers)} dealer documents.")
    else:
        print(f"Not found: {dealers_path}")

    if thresholds_path.exists():
        thresholds = load_json_array(thresholds_path)
        for t in thresholds:
            db.inventory_thresholds.update_one(
                {"warehouse_code": t["warehouse_code"], "sku": t["sku"]},
                {"$set": t},
                upsert=True,
            )
        print(f"Upserted {len(thresholds)} inventory_thresholds documents.")
    else:
        print(f"Not found: {thresholds_path}")

    # Verify: print counts so you can confirm in Compass
    try:
        catalog_count = db.catalog.count_documents({})
        inv_count = db.inventory_by_warehouse.count_documents({})
        warehouses_count = db.warehouses.count_documents({})
        dealers_count = db.dealers.count_documents({})
        thresholds_count = db.inventory_thresholds.count_documents({})
        print(f"Verify: catalog={catalog_count}, inventory_by_warehouse={inv_count}, warehouses={warehouses_count}, dealers={dealers_count}, inventory_thresholds={thresholds_count}.")
    except Exception as e:
        print(f"Verify count failed: {e}")


if __name__ == "__main__":
    main()
