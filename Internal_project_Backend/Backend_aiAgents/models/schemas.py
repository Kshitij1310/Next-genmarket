from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class HealthResponse(BaseModel):
    status: str


class DemandForecastRequest(BaseModel):
    history: List[float] = Field(..., description="Historical demand values in order")


class DemandForecastResponse(BaseModel):
    prediction: float


class PaymentValidationRequest(BaseModel):
    tx_hash: str
    network: str
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    amount_wei: Optional[int] = None


class PaymentResponse(BaseModel):
    tx_hash: Optional[str]


class ProductPayload(BaseModel):
    sku: str
    name: str
    description: str
    attributes: Dict[str, Any] = Field(default_factory=dict)


class InventoryUpdate(BaseModel):
    sku: str
    qty: int
    metadata: Optional[Dict[str, Any]] = None


class InventoryThreshold(BaseModel):
    sku: str
    min_qty: int


class UploadProductRequest(BaseModel):
    product: ProductPayload
    inventory_update: Optional[InventoryUpdate] = None
    inventory_thresholds: Optional[List[InventoryThreshold]] = None


class DemandRequest(BaseModel):
    sku: str
    history: List[float]


class ShipmentUpdate(BaseModel):
    shipment_id: str
    status: str
    location: str
    updated_at: datetime
    expected_at: Optional[datetime] = None


class PlaceOrderRequest(BaseModel):
    order_id: Optional[str] = None
    customer_query: str
    inventory_thresholds: Optional[List[InventoryThreshold]] = None
    payment_required: bool = False
    payment_request: Optional[PaymentValidationRequest] = None
    demand_request: Optional[DemandRequest] = None
    shipment_update: Optional[ShipmentUpdate] = None
    inventory_update: Optional[InventoryUpdate] = None


class OrchestratorResponse(BaseModel):
    order_id: Optional[str] = None
    events: List[Dict[str, Any]] = Field(default_factory=list)
    results: Dict[str, Any] = Field(default_factory=dict)


class TrackResponse(BaseModel):
    order_id: str
    status: str
    events: List[Dict[str, Any]] = Field(default_factory=list)
    state: Dict[str, Any] = Field(default_factory=dict)


# New API contract models

class ProductSummary(BaseModel):
    sku: str
    name: str
    description: str
    image_url: str = ""
    price: float
    currency: str
    brand: str
    category: str
    stock_available: bool
    discount_active: Optional[bool] = None
    discount_percent: Optional[int] = None
    original_price: Optional[float] = None
    nearest_expiry_date: Optional[datetime] = None
    days_to_expiry: Optional[int] = None


class ProductDetail(BaseModel):
    sku: str
    name: str
    description: str
    image_url: str = ""
    price: float
    currency: str
    attributes: Dict[str, Any]
    total_stock: int
    warehouse_distribution: Dict[str, int]
    discount_active: Optional[bool] = None
    discount_percent: Optional[int] = None
    original_price: Optional[float] = None
    nearest_expiry_date: Optional[datetime] = None
    days_to_expiry: Optional[int] = None


class ProductListResponse(BaseModel):
    page: int
    page_size: int
    total: int
    items: List[ProductSummary]


class SearchResult(BaseModel):
    product: ProductSummary
    relevance_score: float


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]


class InventoryItem(BaseModel):
    warehouse_code: str
    sku: str
    quantity: int
    category: str
    brand: str
    bin_location: str
    price: float = 0.0
    currency: str = "USD"
    expiry_date: Optional[datetime] = None
    days_to_expiry: Optional[int] = None


class InventoryBatchCreateRequest(BaseModel):
    warehouse_code: str
    sku: str
    quantity: int
    expiry_date: datetime
    source: str = "restock"


class WarehouseResponse(BaseModel):
    warehouse_code: str
    products: List[InventoryItem]


class WarehousesResponse(BaseModel):
    warehouses: List[WarehouseResponse]


class PaymentMethod(str, Enum):
    CASH_ON_DELIVERY = "cash_on_delivery"
    STRIPE = "stripe"
    ETH = "eth"
    MATIC = "matic"


class OrderItem(BaseModel):
    sku: str
    quantity: int


class OrderCreateRequest(BaseModel):
    sku: Optional[str] = None
    quantity: Optional[int] = None
    customer_id: Optional[str] = None
    payment_method: str = "cash_on_delivery"  # cash_on_delivery | stripe | eth | matic
    payment_completed: bool = False  # true if Stripe/ETH/Matic payment already confirmed
    tx_hash: Optional[str] = None  # for eth/matic
    stripe_payment_id: Optional[str] = None  # for stripe
    stripe_session_id: Optional[str] = None  # Stripe Checkout Session id (cs_...)
    items: Optional[List[OrderItem]] = None  # multi-item order; if set, overrides sku/quantity


class OrderCreateResponse(BaseModel):
    order_id: Optional[str] = None
    cart_id: Optional[str] = None
    status: str
    allocated_warehouse: Optional[str] = None
    shipment_id: Optional[str] = None
    created_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    payment_id: Optional[str] = None
    message: str = ""  # e.g. "Order confirmed" vs "Added to cart - complete payment to place order"
    checkout_url: Optional[str] = None
    stripe_session_id: Optional[str] = None


class OrderDetailResponse(BaseModel):
    order_id: str
    sku: str
    quantity: int
    customer_id: str
    status: str
    allocated_warehouse: str
    shipment_id: str
    payment_status: str
    created_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    payment_id: Optional[str] = None
    stripe_payment_id: Optional[str] = None
    stripe_session_id: Optional[str] = None


class DeliveredOrderLineItem(BaseModel):
    sku: str
    product_name: str
    quantity: int
    unit_price_usd: float
    line_total_usd: float


class DeliveredWarehouseOrder(BaseModel):
    order_id: str
    shipment_id: str
    customer_id: str
    warehouse_code: str
    status: str
    payment_method: str
    payment_status: str
    created_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    included_in_revenue: bool
    revenue_exclusion_reason: Optional[str] = None
    total_amount_usd: float
    items: List[DeliveredOrderLineItem]


class WarehouseRevenueResponse(BaseModel):
    warehouse_code: str
    delivered_orders_count: int
    revenue_eligible_orders_count: int
    stripe_revenue_usd: float
    cod_revenue_usd: float
    total_revenue_usd: float
    currency: str = "USD"


class WarehouseDeliveredOrdersResponse(BaseModel):
    warehouse_code: str
    delivered_orders_count: int
    revenue_eligible_orders_count: int
    stripe_revenue_usd: float
    cod_revenue_usd: float
    total_revenue_usd: float
    currency: str = "USD"
    orders: List[DeliveredWarehouseOrder]


class CartItemResponse(BaseModel):
    sku: str
    quantity: int
    name: str
    price: float
    currency: str


class CartResponse(BaseModel):
    cart_id: str
    customer_id: str
    items: List[CartItemResponse]
    payment_method: str
    payment_status: str


class CartCheckoutRequest(BaseModel):
    tx_hash: Optional[str] = None
    stripe_payment_id: Optional[str] = None


class CartPaymentSessionResponse(BaseModel):
    cart_id: str
    checkout_url: str
    session_id: str


class CartItemRequest(BaseModel):
    sku: str
    quantity: int


class CartCreateRequest(BaseModel):
    items: List[CartItemRequest]
    payment_method: str = "stripe"


class ShipmentTrackingResponse(BaseModel):
    shipment_id: str
    status: str
    location: str
    eta: datetime
    map_enabled: bool = False
    message: str = "Live map tracking currently unavailable"


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    intent: str
    confidence: float


class PaymentStatusResponse(BaseModel):
    payment_id: str
    network: str
    status: str
    amount: float
    currency: str = "USD"


class PaymentRecordRequest(BaseModel):
    """Record a crypto payment for testing / webhook."""
    tx_hash: str
    network: str  # eth | matic
    status: str = "confirmed"
    amount: float = 0.0
    currency: str = "ETH"
    customer_id: Optional[str] = None


class StripePaymentRecordRequest(BaseModel):
    """Record a Stripe payment for testing / webhook."""
    stripe_payment_id: str
    status: str = "confirmed"
    amount: float = 0.0
    currency: str = "USD"
    customer_id: Optional[str] = None


class AIOpsForecastResponse(BaseModel):
    sku: str
    predicted_demand: int
    recommended_warehouse: str
    confidence: float


class ReorderRunResponse(BaseModel):
    low_stock_count: int
    orders_created: int
    orders: List[Dict[str, Any]]


class AISupplyOrderResponse(BaseModel):
    order_id: str
    warehouse_code: str
    sku: str
    product_name: str
    quantity: int
    current_qty: int
    min_qty: int
    max_qty: int
    dealer_email: str
    status: str
    created_at: datetime


class SignupRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    customer_id: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    theme: Optional[str] = None  # system | light | dark
    density: Optional[str] = None  # comfortable | compact
    default_warehouse: Optional[str] = None
    enable_ai_reorder: Optional[bool] = None
    enable_notifications: Optional[bool] = None


class ProfileResponse(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: str
    customer_id: Optional[str] = None
    theme: Optional[str] = None
    density: Optional[str] = None
    default_warehouse: Optional[str] = None
    enable_ai_reorder: Optional[bool] = None
    enable_notifications: Optional[bool] = None


class NotificationResponse(BaseModel):
    notification_id: str
    audience: str
    type: str
    title: str
    message: str
    link: str = ""
    read: bool = False
    created_at: Optional[str] = None


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class NotificationActionResponse(BaseModel):
    success: bool
    unread_count: int
