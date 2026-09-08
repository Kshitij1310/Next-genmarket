# Migration from Mock Data to MongoDB

All API endpoints now use MongoDB collections instead of `services/mock_data.py`.

## Changes Made

### 1. **Product Service** (`services/product_service.py`)
- **Before**: Queried `db.products` collection (fallback to `mock_data.PRODUCTS`)
- **After**: Queries `catalog` collection
- **Enhancements**:
  - Calculates `total_stock` from `inventory_by_warehouse` collection
  - Builds `warehouse_distribution` map from inventory data
  - Extracts `price`, `brand`, `currency` from `attributes` field if not at top level
  - Search now includes SKU matching

**Endpoints affected:**
- `GET /api/products` - Lists products from catalog
- `GET /api/products/{sku}` - Gets product detail from catalog
- `GET /api/search?q=...` - Searches catalog collection

### 2. **Inventory Service** (`services/inventory_service.py`)
- **Before**: Queried `db.inventory` collection (fallback to `mock_data.INVENTORY_ITEMS`)
- **After**: Queries `inventory_by_warehouse` and `warehouses` collections
- **Enhancements**:
  - Returns warehouse info (name, region) from `warehouses` collection
  - Transforms inventory data to match API schema
  - Handles missing `bin_location` gracefully

**Endpoints affected:**
- `GET /api/inventory/warehouses` - Lists all warehouses with products
- `GET /api/inventory/warehouse/{warehouse_code}` - Gets warehouse details
- `GET /api/inventory/warehouse/{warehouse_code}/products` - Gets products in warehouse
- `GET /api/inventory/sku/{sku}` - Gets inventory for SKU across warehouses

### 3. **Order Service** (`services/order_service.py`)
- **Before**: Used `mock_data.INVENTORY_ITEMS` to allocate warehouse
- **After**: Queries `inventory_by_warehouse` to find warehouse with sufficient stock
- **Enhancements**:
  - Allocates warehouse based on available quantity
  - Falls back to warehouse with any stock if exact quantity not available
  - Creates shipment record in `shipments` collection

**Endpoints affected:**
- `POST /api/orders` - Creates order and allocates warehouse
- `GET /api/orders/{order_id}` - Gets order details

### 4. **AIOps Service** (`services/aiops_service.py`)
- **Before**: Generated mock predictions
- **After**: Queries `aiops_predictions` collection for latest forecast
- **Enhancements**:
  - Returns stored predictions if available
  - Falls back to mock prediction if no data found

**Endpoints affected:**
- `GET /api/aiops/forecast/{sku}` - Gets demand forecast

### 5. **RAG Service** (`services/rag.py`)
- **Before**: Used in-memory `PRODUCTS` list
- **After**: Queries `catalog` collection
- **Enhancements**:
  - Real-time product search from MongoDB
  - Used by chat service for context

**Endpoints affected:**
- `POST /api/chat` - Uses RAG for product context

### 6. **Payment & Tracking Services**
- Already using MongoDB (`payments` and `shipments` collections)
- No changes needed

## MongoDB Collections Used

| Collection | Purpose | Used By |
|------------|---------|---------|
| `catalog` | Product catalog | Product service, RAG service |
| `inventory_by_warehouse` | Inventory per warehouse | Inventory service, Order service, Product service |
| `warehouses` | Warehouse metadata | Inventory service |
| `orders` | Order records | Order service |
| `shipments` | Shipment tracking | Tracking service, Order service |
| `payments` | Payment records | Payment service |
| `aiops_predictions` | Demand forecasts | AIOps service |

## Data Structure Mapping

### Product (from `catalog` collection)
```json
{
  "sku": "IPHONE-14-128GB",
  "name": "iPhone 14",
  "description": "...",
  "category": "phones",
  "attributes": {
    "brand": "Apple",
    "price": 999.0,
    "currency": "USD"
  }
}
```
→ Enriched with `total_stock` and `warehouse_distribution` from `inventory_by_warehouse`

### Inventory (from `inventory_by_warehouse` collection)
```json
{
  "sku": "IPHONE-14-128GB",
  "warehouse_code": "WH-N",
  "qty": 50,
  "category": "phones",
  "brand": "Apple",
  "product_name": "iPhone 14"
}
```
→ Transformed to API format with `quantity` (from `qty`), `bin_location` (from `metadata.bin`)

## Testing

After running `python scripts/seed_mongo.py`, all endpoints should return data from MongoDB:

1. **Products**: `GET /api/products` should return 16 products from catalog
2. **Inventory**: `GET /api/inventory/warehouses` should return 6 warehouses
3. **Search**: `GET /api/search?q=iphone` should find iPhone products
4. **Orders**: `POST /api/orders` should allocate warehouse from inventory_by_warehouse
5. **Forecast**: `GET /api/aiops/forecast/IPHONE-14-128GB` should return prediction from aiops_predictions

## Notes

- All services gracefully handle missing data (return empty lists/None)
- Mock data fallback removed - services now rely entirely on MongoDB
- If collections are empty, endpoints return empty results (no errors)
- Ensure MongoDB connection is configured in `.env` file
