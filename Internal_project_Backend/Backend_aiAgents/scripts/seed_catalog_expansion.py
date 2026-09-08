"""
Expand catalog + inventory seed for new categories and products, then sync to MongoDB.

Updates these collections:
- catalog
- inventory_thresholds
- inventory_by_warehouse
- warehouses

Also writes generated seed JSON files to data/ so future reseeds stay consistent.

Run:
    python scripts/seed_catalog_expansion.py
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Any

from pymongo import MongoClient
from pymongo import UpdateOne

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.config import settings

DATA_DIR = ROOT / "data"


WAREHOUSES = [
    {"code": "WH-N", "name": "North Distribution Center", "region": "North", "factor": 1.00},
    {"code": "WH-S", "name": "South Distribution Center", "region": "South", "factor": 0.52},
    {"code": "WH-E", "name": "East Distribution Center", "region": "East", "factor": 0.85},
    {"code": "WH-W", "name": "West Distribution Center", "region": "West", "factor": 0.70},
    {"code": "WH-C", "name": "Central Distribution Center", "region": "Central", "factor": 1.15},
    {"code": "WH-NE", "name": "Northeast Distribution Center", "region": "Northeast", "factor": 0.62},
]


def build_catalog() -> List[Dict[str, Any]]:
    products: List[Dict[str, Any]] = [
        # Existing core set
        {
            "sku": "IPHONE-14-128GB",
            "name": "iPhone 16e 128 GB",
            "description": "Built for Apple Intelligence, A18 chip, 48MP Fusion camera, 6.1-inch Super Retina XDR display.",
            "category": "phones",
            "brand": "Apple",
            "price": 799.99,
            "currency": "USD",
            "image_url": "/images/iphone-14-128gb.png",
            "attributes": {"storage": "128GB", "chip": "A18", "camera": "48MP Fusion", "color": "Black"},
        },
        {
            "sku": "IPHONE-14-256GB",
            "name": "iPhone 16e 256 GB",
            "description": "Built for Apple Intelligence, A18 chip, 48MP Fusion camera, 6.1-inch Super Retina XDR display.",
            "category": "phones",
            "brand": "Apple",
            "price": 899.99,
            "currency": "USD",
            "image_url": "/images/iphone-14-256gb.png",
            "attributes": {"storage": "256GB", "chip": "A18", "camera": "48MP Fusion", "color": "Black"},
        },
        {
            "sku": "REDMI-NOTE-13-128GB",
            "name": "Redmi Note 13 128GB",
            "description": "AMOLED display smartphone with 120Hz refresh rate and all-day battery.",
            "category": "phones",
            "brand": "Redmi",
            "price": 249.99,
            "currency": "USD",
            "image_url": "/images/redmi-note-13-128gb.png",
            "attributes": {"storage": "128GB", "display": "120Hz AMOLED", "camera": "108MP"},
        },
        {
            "sku": "REDMI-NOTE13-256GB",
            "name": "Redmi Note 13 256GB",
            "description": "AMOLED display smartphone with 120Hz refresh rate and all-day battery.",
            "category": "phones",
            "brand": "Redmi",
            "price": 299.99,
            "currency": "USD",
            "image_url": "/images/redmi-note-13-256gb.png",
            "attributes": {"storage": "256GB", "display": "120Hz AMOLED", "camera": "108MP"},
        },
        {
            "sku": "MACBOOK-AIR-M1",
            "name": "MacBook Air M1",
            "description": "13.3-inch Retina laptop with Apple M1 chip and all-day battery life.",
            "category": "laptops",
            "brand": "Apple",
            "price": 999.99,
            "currency": "USD",
            "image_url": "/images/macbook-air-m1.png",
            "attributes": {"ram": "8GB", "chip": "M1", "display": "13.3-inch Retina"},
        },
        {
            "sku": "DELL-XPS-15",
            "name": "Dell XPS 15",
            "description": "15.6-inch performance laptop with Intel Core i7 and premium build.",
            "category": "laptops",
            "brand": "Dell",
            "price": 1299.99,
            "currency": "USD",
            "image_url": "/images/dell-xps-15.png",
            "attributes": {"ram": "16GB", "processor": "Intel i7", "display": "15.6-inch"},
        },
        {
            "sku": "HP-PAVILION-15",
            "name": "HP Pavilion 15",
            "description": "Everyday laptop with Ryzen 5, SSD storage, and balanced performance.",
            "category": "laptops",
            "brand": "HP",
            "price": 649.99,
            "currency": "USD",
            "image_url": "/images/hp-pavilion-15.png",
            "attributes": {"ram": "8GB", "processor": "Ryzen 5", "display": "15.6-inch"},
        },
        {
            "sku": "LENOVO-IDEAPAD-15",
            "name": "Lenovo IdeaPad 15",
            "description": "Reliable 15.6-inch laptop for daily productivity and office workloads.",
            "category": "laptops",
            "brand": "Lenovo",
            "price": 549.99,
            "currency": "USD",
            "image_url": "/images/lenovo-ideapad-15.png",
            "attributes": {"ram": "8GB", "processor": "Intel i5", "display": "15.6-inch"},
        },
        {
            "sku": "GROCERY-RICE-BASMATI-5KG",
            "name": "Basmati Rice 5kg",
            "description": "Premium long-grain aged basmati rice, aromatic and ideal for daily meals.",
            "category": "grocery",
            "brand": "India Gate",
            "price": 12.99,
            "currency": "USD",
            "image_url": "/images/rice-basmati-5kg.png",
            "attributes": {"weight": "5kg"},
        },
        {
            "sku": "GROCERY-OIL-SUNFLOWER-1L",
            "name": "Sunflower Oil 1L",
            "description": "Refined sunflower cooking oil, light and heart-friendly.",
            "category": "grocery",
            "brand": "Fortune",
            "price": 8.99,
            "currency": "USD",
            "image_url": "/images/sunflower-oil-1l.png",
            "attributes": {"volume": "1L"},
        },
        {
            "sku": "GROCERY-PULSE-MOONG-1KG",
            "name": "Moong Dal 1kg",
            "description": "Protein-rich split green gram dal, cleaned and sorted.",
            "category": "grocery",
            "brand": "Tata Sampann",
            "price": 4.99,
            "currency": "USD",
            "image_url": "/images/moong-dal-1kg.png",
            "attributes": {"weight": "1kg"},
        },
        {
            "sku": "GROCERY-SNACKS-MIX-500G",
            "name": "Snacks Mix 500g",
            "description": "Assorted namkeen and crunchy tea-time snacks.",
            "category": "grocery",
            "brand": "Haldiram",
            "price": 6.99,
            "currency": "USD",
            "image_url": "/images/snacks-mix-500g.png",
            "attributes": {"weight": "500g"},
        },
        {
            "sku": "FASHION-TSHIRT-M-COTTON",
            "name": "Men Cotton T-Shirt (M)",
            "description": "Regular fit breathable cotton t-shirt for men.",
            "category": "fashion",
            "brand": "Roadster",
            "price": 24.99,
            "currency": "USD",
            "image_url": "/images/tshirt-cotton-m.png",
            "attributes": {"size": "M", "material": "Cotton"},
        },
        {
            "sku": "FASHION-JEANS-M-DENIM",
            "name": "Men Denim Jeans (M)",
            "description": "Slim fit stretch denim jeans for men.",
            "category": "fashion",
            "brand": "Levis",
            "price": 89.99,
            "currency": "USD",
            "image_url": "/images/jeans-denim-m.png",
            "attributes": {"size": "M", "material": "Denim"},
        },
        {
            "sku": "FASHION-SHOES-SPORTS-42",
            "name": "Sports Shoes Size 42",
            "description": "Lightweight running and training shoes with cushioned sole.",
            "category": "fashion",
            "brand": "Nike",
            "price": 119.99,
            "currency": "USD",
            "image_url": "/images/sports-shoes-42.png",
            "attributes": {"size": "42", "type": "Sports"},
        },
        {
            "sku": "FASHION-JACKET-M-WINTER",
            "name": "Men Winter Jacket (M)",
            "description": "Insulated winter jacket with warm inner lining.",
            "category": "fashion",
            "brand": "Tommy Hilfiger",
            "price": 149.99,
            "currency": "USD",
            "image_url": "/images/winter-jacket-m.png",
            "attributes": {"size": "M", "season": "Winter"},
        },
    ]

    new_items = [
        # Earbuds
        ("EARBUDS-BOULT-AIRBASS", "Boult Audio AirBass Wireless Earbuds", "earbuds", "Boult", 34.99),
        ("EARBUDS-NOISE-VS102", "Noise Buds VS102 Wireless Earbuds", "earbuds", "Noise", 29.99),
        ("EARBUDS-ONEPLUS-NORD", "OnePlus Nord Buds Wireless Earbuds", "earbuds", "OnePlus", 49.99),
        ("EARBUDS-BOAT-AIRDOPES-141", "boAt Airdopes 141 Wireless Earbuds", "earbuds", "boAt", 27.99),
        # Headphones
        ("HEADPHONES-SONY-WHCH520", "Sony WH-CH520 Wireless Headphone", "headphones", "Sony", 69.99),
        ("HEADPHONES-JBL-TUNE760NC", "JBL Tune 760NC Over-Ear Headphones", "headphones", "JBL", 89.99),
        ("HEADPHONES-SENNHEISER-HD350BT", "Sennheiser HD 350BT Wireless Headphones", "headphones", "Sennheiser", 99.99),
        ("HEADPHONES-BOSE-QC45", "Bose QuietComfort 45 Headphones", "headphones", "Bose", 279.99),
        # Fast charging adapter
        ("CHARGER-ANKER-65W-GAN", "Anker 65W GaN Fast Charger", "chargers", "Anker", 59.99),
        ("CHARGER-SAMSUNG-45W", "Samsung 45W Super Fast Charger", "chargers", "Samsung", 49.99),
        ("CHARGER-BELKIN-30W-USBC", "Belkin 30W USB-C Fast Charger", "chargers", "Belkin", 39.99),
        ("CHARGER-SPIGEN-70W-GAN", "Spigen 70W GaN Fast Charger", "chargers", "Spigen", 54.99),
        # Phone case
        ("CASE-SPIGEN-RUGGED-ARMOR", "Spigen Rugged Armor Phone Case", "cases", "Spigen", 22.99),
        ("CASE-OTTERBOX-DEFENDER", "OtterBox Defender Protective Case", "cases", "OtterBox", 34.99),
        ("CASE-RINGKE-FUSION-X", "Ringke Fusion X Phone Case", "cases", "Ringke", 19.99),
        ("CASE-CASEOLOGY-NANO-POP", "Caseology Nano Pop Phone Case", "cases", "Caseology", 24.99),
        # Laptop backpacks
        ("BACKPACK-SAMSONITE-XENON", "Samsonite XENON Laptop Backpack", "backpacks", "Samsonite", 89.99),
        ("BACKPACK-TARGUS-CITYSMART", "Targus CitySmart Laptop Backpack", "backpacks", "Targus", 64.99),
        ("BACKPACK-LENOVO-LEGION", "Lenovo Legion Laptop Backpack", "backpacks", "Lenovo", 79.99),
        ("BACKPACK-HP-ODYSSEY", "HP Odyssey Laptop Backpack", "backpacks", "HP", 69.99),
        # USB-C hubs
        ("HUB-ANKER-POWEREXPAND", "Anker PowerExpand USB-C Hub", "usb_hubs", "Anker", 49.99),
        ("HUB-BELKIN-MULTIMEDIA", "Belkin USB-C Multimedia Hub", "usb_hubs", "Belkin", 59.99),
        ("HUB-SATECHI-ALUMINUM", "Satechi Aluminum USB-C Hub", "usb_hubs", "Satechi", 69.99),
        ("HUB-HYPERDRIVE-USBC", "HyperDrive USB-C Hub", "usb_hubs", "HyperDrive", 74.99),
        # Wireless mouse
        ("MOUSE-LOGITECH-MX-MASTER-3S", "Logitech MX Master 3S Wireless Mouse", "wireless_mice", "Logitech", 99.99),
        ("MOUSE-RAZER-BASILISK-X", "Razer Basilisk X Wireless Mouse", "wireless_mice", "Razer", 59.99),
        ("MOUSE-HP-Z3700", "HP Z3700 Wireless Mouse", "wireless_mice", "HP", 24.99),
        ("MOUSE-DELL-WM126", "Dell WM126 Wireless Mouse", "wireless_mice", "Dell", 21.99),
        # Laptop cooling pad
        ("COOLINGPAD-NOTEPAL-X3", "Cooler Master NotePal X3", "cooling_pads", "Cooler Master", 44.99),
        ("COOLINGPAD-MASSIVE-20-RGB", "Thermaltake Massive 20 RGB Cooling Pad", "cooling_pads", "Thermaltake", 64.99),
        ("COOLINGPAD-KLIM-WIND", "KLIM Wind Laptop Cooling Pad", "cooling_pads", "KLIM", 39.99),
        ("COOLINGPAD-HAVIT-HVF2056", "Havit HV-F2056 Cooling Pad", "cooling_pads", "Havit", 34.99),
        # Grocery new
        ("GROCERY-ALMONDS-500G-CA", "California Almonds Premium 500g", "grocery", "California Almonds", 11.99),
        ("GROCERY-ALMONDS-500G-HAPPILO", "Happilo Natural Almonds 500g", "grocery", "Happilo", 10.99),
        ("GROCERY-ALMONDS-500G-24MANTRA", "24 Mantra Organic Almonds 500g", "grocery", "24 Mantra", 12.99),
        ("GROCERY-ALMONDS-500G-NUTRAJ", "Nutraj California Almonds 500g", "grocery", "Nutraj", 10.49),
        ("GROCERY-SOFTDRINK-COCA-COLA-1L", "Coca-Cola Soft Drink 1L", "grocery", "Coca-Cola", 2.49),
        ("GROCERY-SOFTDRINK-PEPSI-1L", "Pepsi Soft Drink 1L", "grocery", "Pepsi", 2.29),
        ("GROCERY-SOFTDRINK-SPRITE-1L", "Sprite Soft Drink 1L", "grocery", "Sprite", 2.19),
        ("GROCERY-SOFTDRINK-FANTA-1L", "Fanta Soft Drink 1L", "grocery", "Fanta", 2.19),
        ("GROCERY-PEANUTBUTTER-1KG-PINTOLA", "Pintola Natural Peanut Butter 1kg", "grocery", "Pintola", 8.99),
        ("GROCERY-PEANUTBUTTER-1KG-MYFITNESS", "MyFitness Peanut Butter 1kg", "grocery", "MyFitness", 9.49),
        ("GROCERY-PEANUTBUTTER-1KG-ALPINO", "Alpino Natural Peanut Butter 1kg", "grocery", "Alpino", 8.79),
        ("GROCERY-PEANUTBUTTER-1KG-FUNFOODS", "Dr. Oetker FunFoods Peanut Butter 1kg", "grocery", "FunFoods", 8.29),
        ("GROCERY-OLIVEOIL-1L-BORGES", "Borges Extra Virgin Olive Oil 1L", "grocery", "Borges", 15.99),
        ("GROCERY-OLIVEOIL-1L-FIGARO", "Figaro Olive Oil 1L", "grocery", "Figaro", 14.99),
        ("GROCERY-OLIVEOIL-1L-DELMONTE", "Del Monte Olive Oil 1L", "grocery", "Del Monte", 13.99),
        ("GROCERY-OLIVEOIL-1L-COLAVITA", "Colavita Extra Virgin Olive Oil 1L", "grocery", "Colavita", 16.49),
        # Fashion new
        ("FASHION-BELT-LEVIS", "Levi's Leather Belt", "fashion", "Levi's", 39.99),
        ("FASHION-BELT-TOMMY", "Tommy Hilfiger Leather Belt", "fashion", "Tommy Hilfiger", 45.99),
        ("FASHION-BELT-CALVIN", "Calvin Klein Leather Belt", "fashion", "Calvin Klein", 49.99),
        ("FASHION-BELT-GUCCI", "Gucci Leather Belt", "fashion", "Gucci", 299.99),
        ("FASHION-RUNNINGSHOES-NIKE-AIRZOOM", "Nike Air Zoom Running Shoes", "fashion", "Nike", 129.99),
        ("FASHION-RUNNINGSHOES-ADIDAS-ULTRABOOST", "Adidas Ultraboost Sneakers", "fashion", "Adidas", 149.99),
        ("FASHION-RUNNINGSHOES-PUMA-VELOCITY", "Puma Velocity Nitro Running Shoes", "fashion", "Puma", 119.99),
        ("FASHION-RUNNINGSHOES-NEWBALANCE-FOAM", "New Balance Fresh Foam Sneakers", "fashion", "New Balance", 139.99),
        ("FASHION-SUNGLASSES-RAYBAN-AVIATOR", "Ray-Ban Aviator Sunglasses", "fashion", "Ray-Ban", 169.99),
        ("FASHION-SUNGLASSES-GUCCI-SQUARE", "Gucci Square Sunglasses", "fashion", "Gucci", 349.99),
        ("FASHION-SUNGLASSES-PRADA-SPORT", "Prada Sport Sunglasses", "fashion", "Prada", 319.99),
        ("FASHION-SUNGLASSES-OAKLEY-HOLBROOK", "Oakley Holbrook Sunglasses", "fashion", "Oakley", 159.99),
        # Smart watch
        ("SMARTWATCH-APPLE-SERIES-9", "Apple Watch Series 9", "wearables", "Apple", 429.99),
        ("SMARTWATCH-SAMSUNG-WATCH-6", "Samsung Galaxy Watch 6", "wearables", "Samsung", 299.99),
        ("SMARTWATCH-GARMIN-VENU-2", "Garmin Venu 2 Smartwatch", "wearables", "Garmin", 349.99),
        ("SMARTWATCH-FOSSIL-GEN-6", "Fossil Gen 6 Smartwatch", "wearables", "Fossil", 229.99),
    ]

    for sku, name, category, brand, price in new_items:
        item = {
            "sku": sku,
            "name": name,
            "description": f"{name} for daily usage with reliable quality and performance.",
            "category": category,
            "brand": brand,
            "price": price,
            "currency": "USD",
            "image_url": f"/images/{sku.lower().replace('_', '-').replace('--', '-')}.png",
            "attributes": {"brand": brand},
            "validation_errors": [],
            "source": "catalog",
        }
        products.append(item)

    # Add expiry for all grocery products (existing + new)
    for p in products:
        if p["category"] == "grocery":
            days = 180
            if "snacks" in p["sku"].lower():
                days = 120
            elif "softdrink" in p["sku"].lower():
                days = 240
            elif "oil" in p["sku"].lower():
                days = 365
            expiry = (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()
            p["expiry_date"] = expiry
            attrs = p.get("attributes", {})
            attrs["expiry_date"] = expiry
            p["attributes"] = attrs

    for p in products:
        p.setdefault("validation_errors", [])
        p.setdefault("source", "catalog")

    return products


def target_thresholds(category: str) -> Dict[str, int]:
    base = {
        "phones": (10, 50),
        "laptops": (6, 34),
        "earbuds": (18, 95),
        "headphones": (10, 58),
        "chargers": (20, 120),
        "cases": (25, 140),
        "backpacks": (8, 52),
        "usb_hubs": (8, 48),
        "wireless_mice": (15, 90),
        "cooling_pads": (8, 45),
        "wearables": (8, 38),
        "grocery": (40, 260),
        "fashion": (12, 75),
    }
    min_q, max_q = base.get(category, (10, 40))
    return {"min_qty": min_q, "max_qty": max_q}


def build_thresholds_and_inventory(products: List[Dict[str, Any]]) -> tuple[list[dict], list[dict], list[dict], dict]:
    now = datetime.now(timezone.utc)
    thresholds: List[Dict[str, Any]] = []
    inventory: List[Dict[str, Any]] = []
    batches: List[Dict[str, Any]] = []
    warehouse_category_max: Dict[str, Dict[str, int]] = {w["code"]: {} for w in WAREHOUSES}
    warehouse_category_qty: Dict[str, Dict[str, int]] = {w["code"]: {} for w in WAREHOUSES}

    for w in WAREHOUSES:
        wf = w["factor"]
        for p in products:
            t = target_thresholds(p["category"])
            max_qty = max(t["min_qty"] + 2, math.ceil(t["max_qty"] * wf))
            min_qty = max(3, math.ceil(t["min_qty"] * wf))
            qty = max(min_qty + 2, math.ceil(max_qty * 0.72))

            thresholds.append(
                {
                    "warehouse_code": w["code"],
                    "sku": p["sku"],
                    "category": p["category"],
                    "min_qty": min_qty,
                    "max_qty": max_qty,
                }
            )
            inv_row = {
                "sku": p["sku"],
                "warehouse_code": w["code"],
                "product_name": p["name"],
                "brand": p["brand"],
                "category": p["category"],
                "qty": qty,
                "reserved_qty": 0,
                "updated_at": {"$date": now.isoformat().replace("+00:00", "Z")},
            }
            if p["category"] == "grocery" and p.get("expiry_date"):
                expiry_iso = f"{p['expiry_date']}T00:00:00Z"
                inv_row["expiry_date"] = {"$date": expiry_iso}
                batches.append(
                    {
                        "batch_id": f"BCH-{w['code']}-{p['sku']}",
                        "warehouse_code": w["code"],
                        "sku": p["sku"],
                        "qty": qty,
                        "expiry_date": {"$date": expiry_iso},
                        "created_at": {"$date": now.isoformat().replace("+00:00", "Z")},
                        "source": "seed",
                        "status": "active",
                    }
                )
            inventory.append(inv_row)

            cat = p["category"]
            warehouse_category_max[w["code"]][cat] = warehouse_category_max[w["code"]].get(cat, 0) + max_qty
            warehouse_category_qty[w["code"]][cat] = warehouse_category_qty[w["code"]].get(cat, 0) + qty

    return thresholds, inventory, batches, {"max": warehouse_category_max, "qty": warehouse_category_qty}


def build_warehouses(rollup: Dict[str, Dict[str, Dict[str, int]]]) -> List[Dict[str, Any]]:
    max_by_wh = rollup["max"]
    qty_by_wh = rollup["qty"]
    docs = []
    for w in WAREHOUSES:
        code = w["code"]
        category_limits = {
            k: math.ceil(v * 1.10) for k, v in sorted(max_by_wh[code].items())
        }
        category_utilization = dict(sorted(qty_by_wh[code].items()))
        current_utilization = sum(category_utilization.values())
        capacity_units = math.ceil(sum(category_limits.values()) * 1.40)
        docs.append(
            {
                "code": code,
                "name": w["name"],
                "region": w["region"],
                "capacity_units": capacity_units,
                "current_utilization": current_utilization,
                "category_limits": category_limits,
                "category_utilization": category_utilization,
            }
        )
    return docs


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def upsert_db(
    catalog: List[Dict[str, Any]],
    thresholds: List[Dict[str, Any]],
    inventory: List[Dict[str, Any]],
    batches: List[Dict[str, Any]],
    warehouses: List[Dict[str, Any]],
) -> None:
    client = MongoClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    sku_set = {p["sku"] for p in catalog}
    warehouse_codes = [w["code"] for w in warehouses]

    # catalog: upsert new/changed, remove obsolete seeded SKUs
    bulk_catalog = [UpdateOne({"sku": p["sku"]}, {"$set": p}, upsert=True) for p in catalog]
    if bulk_catalog:
        db.catalog.bulk_write(bulk_catalog, ordered=False)
    db.catalog.delete_many({"source": "catalog", "sku": {"$nin": list(sku_set)}})

    # replace thresholds and inventory for managed warehouses
    db.inventory_thresholds.delete_many({"warehouse_code": {"$in": warehouse_codes}})
    if thresholds:
        db.inventory_thresholds.insert_many(thresholds, ordered=False)

    inv_for_db = []
    for d in inventory:
        dt = datetime.fromisoformat(d["updated_at"]["$date"].replace("Z", "+00:00"))
        doc = {**d, "updated_at": dt}
        if isinstance(d.get("expiry_date"), dict) and d["expiry_date"].get("$date"):
            doc["expiry_date"] = datetime.fromisoformat(d["expiry_date"]["$date"].replace("Z", "+00:00"))
        inv_for_db.append(doc)
    db.inventory_by_warehouse.delete_many({"warehouse_code": {"$in": warehouse_codes}})
    if inv_for_db:
        db.inventory_by_warehouse.insert_many(inv_for_db, ordered=False)

    # inventory batches (for FEFO selling on expiry)
    db.inventory_batches.delete_many({"warehouse_code": {"$in": warehouse_codes}})
    batch_for_db = []
    for b in batches:
        batch_for_db.append(
            {
                **b,
                "created_at": datetime.fromisoformat(b["created_at"]["$date"].replace("Z", "+00:00")),
                "expiry_date": datetime.fromisoformat(b["expiry_date"]["$date"].replace("Z", "+00:00")),
            }
        )
    if batch_for_db:
        db.inventory_batches.insert_many(batch_for_db, ordered=False)

    # warehouses
    bulk_wh = [UpdateOne({"code": w["code"]}, {"$set": w}, upsert=True) for w in warehouses]
    if bulk_wh:
        db.warehouses.bulk_write(bulk_wh, ordered=False)

    print("MongoDB sync complete:")
    print(f"  catalog={db.catalog.count_documents({})}")
    print(f"  inventory_thresholds={db.inventory_thresholds.count_documents({})}")
    print(f"  inventory_by_warehouse={db.inventory_by_warehouse.count_documents({})}")
    print(f"  inventory_batches={db.inventory_batches.count_documents({})}")
    print(f"  warehouses={db.warehouses.count_documents({})}")
    print(f"  grocery_with_expiry={db.catalog.count_documents({'category': 'grocery', 'expiry_date': {'$exists': True}})}")


def main() -> None:
    catalog = build_catalog()
    thresholds, inventory, batches, rollup = build_thresholds_and_inventory(catalog)
    warehouses = build_warehouses(rollup)

    write_json(DATA_DIR / "seed_catalog.json", catalog)
    write_json(DATA_DIR / "seed_inventory_thresholds.json", thresholds)
    write_json(DATA_DIR / "seed_inventory_by_warehouse.json", inventory)
    write_json(DATA_DIR / "seed_inventory_batches.json", batches)
    write_json(DATA_DIR / "seed_warehouses.json", warehouses)
    print("Seed JSON files updated in data/.")

    upsert_db(catalog, thresholds, inventory, batches, warehouses)


if __name__ == "__main__":
    main()
