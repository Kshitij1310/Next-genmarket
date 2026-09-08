import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, CreditCard, Truck, Clock, CheckCircle2, XCircle } from "lucide-react";

import { useOrders, useProducts } from "@/hooks/queries";

export default function Order() {
  const navigate = useNavigate();


  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [searchParams] = useSearchParams();

  const API_BASE = useMemo(
    () => (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, ""),
    []
  );

  const customerId = localStorage.getItem("customer_id");

  const { data: productsData } = useProducts({ page: 1, pageSize: 100 });
  const productMap = useMemo(() => {
    const map = {};
    (productsData?.items || []).forEach((product) => {
      map[product.sku] = product;
    });
    return map;
  }, [productsData]);

  const {
    data: ordersData,
    isLoading: loading,
    isError,
    error: ordersError,
  } = useOrders(customerId);

  const orders = ordersData?.orders || [];
  const error = !customerId
    ? "Missing customer id. Please login again."
    : isError
      ? ordersError?.message || "Failed to fetch orders"
      : "";

  // The Stripe redirect result is derived from the URL rather than copied into
  // state; only clearing the address bar is an actual side effect.
  const paymentStatus = searchParams.get("payment");
  const paymentMessage =
    paymentStatus === "success"
      ? "Payment successful! Your order has been placed."
      : paymentStatus === "cancel"
        ? "Payment failed or cancelled."
        : null;

  useEffect(() => {
    if (!paymentMessage) return;
    localStorage.removeItem("stripe_in_progress");
    window.history.replaceState({}, document.title, "/orders");
  }, [paymentMessage]);

  const normalizeValue = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

  const normalizePaymentStatus = (value) => {
    const normalized = normalizeValue(value);
    if (normalized === "completed") return "confirmed";
    return normalized;
  };

  const placeholderSrc = "/images/product-placeholder.svg";

  const getProductImage = (product) => {
    const candidates = [
      product?.image_url,
      product?.imageUrl,
      product?.image,
      product?.image_path,
      product?.thumbnail,
    ].filter(Boolean);

    const raw = candidates.find((val) => typeof val === "string" && val.trim().length > 0);
    if (!raw) return placeholderSrc;

    const normalized = raw.trim();
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
    if (normalized.startsWith("/")) return normalized;
    return `${API_BASE}/${normalized.replace(/^\/+/, "")}`;
  };

  const getOrderDate = (order) => {
    const raw = order?.created_at ?? order?.createdAt ?? order?.date;
    const parsed = raw ? new Date(raw) : null;
    const timestamp = parsed && !Number.isNaN(parsed.getTime())
      ? parsed.getTime()
      : 0;
    return timestamp;
  };

  const filteredOrders = [...orders]
    .filter((order) => {
      const status = normalizeValue(order?.status);
      const paymentStatus = normalizePaymentStatus(order?.payment_status);

      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (paymentFilter !== "all" && paymentStatus !== paymentFilter)
        return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest")
        return getOrderDate(b) - getOrderDate(a);

      if (sortBy === "oldest")
        return getOrderDate(a) - getOrderDate(b);

      return 0;
    });

  if (loading)
    return (
      <div className="page-shell p-6">
        <div className="space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse"></div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`order-skeleton-${i}`}
              className="surface-card bg-white border border-slate-200 rounded-2xl shadow-sm p-6 animate-pulse"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-100 rounded"></div>
                  <div className="h-3 w-28 bg-slate-100 rounded"></div>
                </div>
                <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
              </div>
              <div className="h-24 bg-slate-100 rounded-xl"></div>
            </div>
          ))}
        </div>
      </div>
    );

  if (error)
    return <p className="text-red-500 p-6">{error}</p>;

  return (
    <div className="page-shell p-6 space-y-8">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-outline flex items-center gap-2 px-3 py-2 text-sm"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-2">
          <Package size={20} className="text-primary" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">
              Purchases
            </p>
            <h1 className="page-title text-2xl">My Orders</h1>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="surface-card flex flex-wrap gap-4 items-center bg-white border border-slate-200 rounded-xl p-4 filter-bar">

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-input px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="form-input px-3 py-2 text-sm"
        >
          <option value="all">All Payments</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="form-input px-3 py-2 text-sm"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>

      </div>

      {/* PAYMENT MESSAGE */}
      {paymentMessage && (
        <div
          className={`p-4 rounded-xl font-medium border ${
            paymentMessage.includes("failed")
              ? "bg-red-50 text-red-600 border-red-200"
              : "bg-green-50 text-green-600 border-green-200"
          }`}
        >
          {paymentMessage}
        </div>
      )}

      {filteredOrders.length === 0 && (
        <div className="surface-card bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center text-slate-500">
          No orders yet.
        </div>
      )}

      {filteredOrders.map((order, index) => {

        const isCOD = order.payment_method === "cash_on_delivery";

        const statusMeta = (() => {
          const s = normalizeValue(order?.status);
          if (s === "confirmed" || s === "shipped" || s === "delivered") {
            return { label: order.status, className: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 };
          }
          if (s === "pending" || s === "processing") {
            return { label: order.status, className: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock };
          }
          if (s === "cancelled" || s === "canceled") {
            return { label: order.status, className: "bg-red-100 text-red-700 border-red-200", icon: XCircle };
          }
          return { label: order.status || "Unknown", className: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock };
        })();

        return (
          <div
            key={index}
            className="surface-card bg-white border border-slate-200 rounded-2xl shadow-sm p-6 hover:shadow-md transition"
          >

            {/* ORDER HEADER */}
            <div className="flex justify-between items-center mb-6">

              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {order.order_id}
                </h2>

                <p className="text-sm text-gray-500">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-semibold border ${statusMeta.className}`}
              >
                <statusMeta.icon size={14} />
                {statusMeta.label}
              </span>

            </div>

            {/* ORDER DETAILS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600 mb-4">
              <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                <CreditCard className="text-primary" size={16} />
                <div>
                  <p className="text-xs text-slate-500">Payment Method</p>
                  <p className="font-semibold text-slate-900">{isCOD ? "Cash On Delivery" : order.payment_method}</p>
                  {!isCOD && (
                    <p className="text-xs text-slate-500 mt-1">
                      Status: {order.payment_status === "completed" ? "Confirmed" : order.payment_status}
                    </p>
                  )}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                <Truck className="text-primary" size={16} />
                <div>
                  <p className="text-xs text-slate-500">Shipment ID</p>
                  <p className="font-semibold text-slate-900">{order.shipment_id || "N/A"}</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                <Clock className="text-primary" size={16} />
                <div>
                  <p className="text-xs text-slate-500">Order Date</p>
                  <p className="font-semibold text-slate-900">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 my-6"></div>

            {/* ITEMS */}
            <div>

              <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wide">
                Items
              </h3>

              <div className="space-y-3">

                {order.items?.map((item, i) => {
                  const product = productMap[item.sku];
                  const priceLabel =
                    product?.price != null
                      ? `${product.currency || "USD"} ${Number(product.price).toFixed(2)}`
                      : item?.price != null
                        ? `${item.currency || "USD"} ${Number(item.price).toFixed(2)}`
                        : null;

                  return (
                    <div
                      key={i}
                      className="flex flex-col md:flex-row md:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200"
                    >
                      <div className="flex items-center gap-4 flex-1">

                        <div className="h-16 w-16 rounded-lg overflow-hidden border border-slate-200 bg-white flex-shrink-0">

                          <img
                            src={getProductImage(product)}
                            alt={product?.name || item.sku}
                            className="h-full w-full object-contain"
                            onError={(e) => { e.currentTarget.src = placeholderSrc; }}
                          />

                        </div>

                        <div className="space-y-1">

                          <p className="text-slate-900 font-semibold">
                            {product?.name || item.sku}
                          </p>

                          <p className="text-xs text-slate-500">
                            Brand: {product?.brand || "N/A"}
                          </p>

                          <p className="text-xs text-slate-500">
                            Category: {product?.category || "N/A"}
                          </p>

                        </div>

                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-sm font-semibold text-slate-700">
                          Qty: {item.quantity}
                        </div>
                        {priceLabel && (
                          <div className="text-sm font-semibold text-primary">
                            {priceLabel}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}

              </div>

            </div>

          </div>
        );
      })}
    </div>
  );
}
