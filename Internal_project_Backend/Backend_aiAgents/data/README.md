# Seed data for supplychain DB

- **seed_warehouses.json** – 6 warehouses (WH-N, WH-S, WH-E, WH-W, WH-C, WH-NE) for the `warehouses` collection.
- **seed_catalog.json** – 16 products (4 phones, 4 laptops, 4 grocery, 4 fashion) for the `catalog` collection.
- **seed_inventory_by_warehouse.json** – Same 16 SKUs × 6 warehouses = 96 docs for `inventory_by_warehouse`.

Warehouse codes used: **WH-N**, **WH-S**, **WH-E**, **WH-W**, **WH-C**, **WH-NE**.  
If your DB uses different codes (e.g. WH-1…WH-6), search-replace in the JSON or in `scripts/seed_mongo.py` before running.

## Load via script (recommended)

From project root:

```bash
python scripts/seed_mongo.py
```

Uses `mongo_uri` and `mongo_db` from your `.env` / config.

## Load via MongoDB Compass

1. Open **supplychain** database.
2. **catalog**: open `catalog` → Add Data → Import File → choose `seed_catalog.json` (if Compass accepts array; else use script).
3. **inventory_by_warehouse**: open `inventory_by_warehouse` → Add Data → Import File → choose `seed_inventory_by_warehouse.json`.

## Load via mongosh

```bash
mongosh "YOUR_MONGO_URI"
use supplychain
# Then paste the array from the JSON file and run:
# db.catalog.insertMany([ ... ])
# db.inventory_by_warehouse.insertMany([ ... ])
```

Or use `mongoimport`:

```bash
mongoimport --uri "YOUR_MONGO_URI" --db supplychain --collection catalog --file data/seed_catalog.json --jsonArray
mongoimport --uri "YOUR_MONGO_URI" --db supplychain --collection inventory_by_warehouse --file data/seed_inventory_by_warehouse.json --jsonArray
```
