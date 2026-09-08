from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.database import Database

from core.db import get_db
from models.schemas import ProductListResponse, ProductSummary, ProductDetail, SearchResponse, SearchResult
from services.product_service import get_products, get_product, search_products

router = APIRouter(prefix="/api", tags=["products"])


@router.get("/products", response_model=ProductListResponse)
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Database = Depends(get_db),
) -> ProductListResponse:
    items, total = get_products(db, page, page_size)

    summaries = []
    for item in items:
        total_stock = int(item.get("total_stock", 0))
        summaries.append(
            ProductSummary(
                sku=item.get("sku", ""),
                name=item.get("name", ""),
                description=item.get("description", ""),
                image_url=item.get("image_url", ""),
                price=float(item.get("price", 0)),
                currency=item.get("currency", "USD"),
                brand=item.get("brand", ""),
                category=item.get("category", ""),
                stock_available=total_stock > 0,
                discount_active=item.get("discount_active"),
                discount_percent=item.get("discount_percent"),
                original_price=item.get("original_price"),
                nearest_expiry_date=item.get("nearest_expiry_date"),
                days_to_expiry=item.get("days_to_expiry"),
            )
        )

    return ProductListResponse(page=page, page_size=page_size, total=total, items=summaries)


@router.get("/products/{sku}", response_model=ProductDetail)
def get_product_detail(sku: str, db: Database = Depends(get_db)) -> ProductDetail:
    item = get_product(db, sku)
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")

    return ProductDetail(
        sku=item.get("sku", ""),
        name=item.get("name", ""),
        description=item.get("description", ""),
        image_url=item.get("image_url", ""),
        price=float(item.get("price", 0)),
        currency=item.get("currency", "USD"),
        attributes=item.get("attributes", {}),
        total_stock=int(item.get("total_stock", 0)),
        warehouse_distribution=item.get("warehouse_distribution", {}),
        discount_active=item.get("discount_active"),
        discount_percent=item.get("discount_percent"),
        original_price=item.get("original_price"),
        nearest_expiry_date=item.get("nearest_expiry_date"),
        days_to_expiry=item.get("days_to_expiry"),
    )


@router.get("/search", response_model=SearchResponse)
def search(q: str, db: Database = Depends(get_db)) -> SearchResponse:
    results = search_products(db, q)
    mapped = []
    for entry in results:
        item = entry["product"]
        total_stock = int(item.get("total_stock", 0))
        mapped.append(
            SearchResult(
                product=ProductSummary(
                    sku=item.get("sku", ""),
                    name=item.get("name", ""),
                    description=item.get("description", ""),
                    image_url=item.get("image_url", ""),
                    price=float(item.get("price", 0)),
                    currency=item.get("currency", "USD"),
                    brand=item.get("brand", ""),
                    category=item.get("category", ""),
                    stock_available=total_stock > 0,
                    discount_active=item.get("discount_active"),
                    discount_percent=item.get("discount_percent"),
                    original_price=item.get("original_price"),
                    nearest_expiry_date=item.get("nearest_expiry_date"),
                    days_to_expiry=item.get("days_to_expiry"),
                ),
                relevance_score=float(entry.get("relevance_score", 0.5)),
            )
        )

    return SearchResponse(query=q, results=mapped)
