import { useState } from "react";
import mapPlaceholder from "../assets/map.png";
import {
  Search,
  ArrowLeft,
  Package,
  MapPin,
  Truck,
  CheckCircle2,
  Clock4,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Tracking() {
  const navigate = useNavigate();

  const [trackingInput, setTrackingInput] = useState("");
  const [trackingData, setTrackingData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const normalizeStatus = (status) => {
    if (!status) return "";
    return status.toString().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  };

  const getStep = (status) => {
    const normalized = normalizeStatus(status);
    if (normalized === "delivered") return 3;
    if (["in_transit", "shipped", "out_for_delivery", "intransit"].includes(normalized))
      return 2;
    if (["preparing", "packed", "processing", "ready_for_dispatch"].includes(normalized))
      return 1;
    return 0;
  };

  const getStatusMeta = (status) => {
    const normalized = normalizeStatus(status);
    if (normalized === "delivered") {
      return { label: "Delivered", color: "bg-green-100 text-green-700 border-green-200" };
    }
    if (["in_transit", "shipped", "out_for_delivery", "intransit"].includes(normalized)) {
      return { label: "In Transit", color: "bg-blue-100 text-blue-700 border-blue-200" };
    }
    if (["preparing", "packed", "processing", "ready_for_dispatch"].includes(normalized)) {
      return { label: "Preparing", color: "bg-amber-100 text-amber-700 border-amber-200" };
    }
    return { label: status || "Unknown", color: "bg-gray-100 text-gray-700 border-gray-200" };
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "N/A";
    return dt.toLocaleString();
  };

  const handleSearch = async () => {
    if (!trackingInput.trim()) return;

    setLoading(true);
    setError("");
    setTrackingData(null);

    try {
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("customer_id");

      if (!customerId) {
        setError("Customer ID not found. Please login again.");
        setLoading(false);
        return;
      }

      let res = await fetch(`/api/${customerId}/shipments/${trackingInput}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      let shipmentData = null;
      let orderData = null;
      let liveShipment = null;

      if (res.ok) {
        shipmentData = await res.json();
      }

      const orderRes = await fetch(`/api/${customerId}/orders/${trackingInput}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!shipmentData && orderRes.ok) {
        orderData = await orderRes.json();

        if (orderData.shipment_id) {
          const shipmentRes = await fetch(
            `/api/${customerId}/shipments/${orderData.shipment_id}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (shipmentRes.ok) {
            shipmentData = await shipmentRes.json();
          }
        }
      }

      const shipmentId = shipmentData?.shipment_id || trackingInput;

      // Fetch canonical tracking status to reflect admin updates (reuses existing tracking API).
      if (shipmentId) {
        const liveRes = await fetch(`/api/tracking/${shipmentId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (liveRes.ok) {
          liveShipment = await liveRes.json();
        }
      }

      if (!shipmentData && !liveShipment) {
        setError("Shipment or Order not found");
        setLoading(false);
        return;
      }

      const merged = {
        ...shipmentData,
        ...liveShipment,
        order_id: shipmentData?.order_id || orderData?.order_id,
        product_sku:
          shipmentData?.sku ||
          liveShipment?.sku ||
          orderData?.items?.[0]?.sku ||
          orderData?.sku,
        warehouse_code:
          shipmentData?.warehouse_code || liveShipment?.warehouse_code || orderData?.allocated_warehouse,
        created_at: shipmentData?.created_at || orderData?.created_at || orderData?.date,
      };

      setTrackingData(merged);
      setLoading(false);
      return;
    } catch (err) {
      console.error(err);
      setError("Failed to fetch tracking details");
    }

    setLoading(false);
  };

  const currentStep = getStep(trackingData?.status);
  const statusMeta = getStatusMeta(trackingData?.status);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-8">

      {/* HEADER WITH BACK BUTTON */}
      <div className="flex items-center gap-3">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-semibold text-gray-900">
          Track Shipment
        </h1>

      </div>

      {/* SEARCH CARD */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

        <div className="flex items-center gap-3">

          <div className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-3 rounded-xl w-full">

            <Search size={18} className="text-gray-400" />

            <input
              type="text"
              placeholder="Enter Shipment ID or Order ID..."
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="bg-transparent outline-none text-gray-700 text-sm w-full"
            />

          </div>

          <button
            onClick={handleSearch}
            className="bg-blue-600 hover:bg-blue-700 transition px-6 py-3 rounded-xl text-white font-medium"
          >
            Search
          </button>

        </div>

      </div>

      {!trackingData && !loading && !error && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="relative h-56 md:h-72 rounded-2xl overflow-hidden">
            <div className="absolute inset-0">
              <img
                src={mapPlaceholder}
                alt="Map placeholder"
                className="h-full w-full object-cover blur-sm"
                loading="lazy"
              />
            </div>

            <div className="absolute inset-0 bg-black/40"></div>

            <div className="absolute inset-x-0 bottom-4 flex justify-center">
              <div className="text-white text-base md:text-lg font-semibold tracking-wide">
                🚚 Track your shipments in real time
              </div>
            </div>
          </div>
        </div>
      )}

      {(loading || error || trackingData) && (

        <div className="bg-white border border-gray-200 rounded-2xl p-10 shadow-sm">

          {/* LOADER */}
          {loading && (

            <div className="flex flex-col items-center gap-4">

              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>

              <p className="text-gray-500">
                Fetching tracking details...
              </p>

            </div>

          )}

          {/* ERROR */}
          {error && (

            <p className="text-red-500 text-center font-medium">
              {error}
            </p>

          )}

          {/* RESULT */}
          {trackingData && (

            <div className="space-y-10">

              {/* SHIPMENT SUMMARY */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-inner space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      <Package size={16} />
                      Shipment Summary
                    </div>
                    <p className="text-2xl font-semibold text-slate-900">
                      {trackingData.shipment_id || "N/A"}
                    </p>
                    <p className="text-sm text-slate-500">
                      Order: <span className="font-medium text-slate-700">{trackingData.order_id || "N/A"}</span>
                    </p>
                  </div>

                  <div className="text-right space-y-2">
                    <div
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${statusMeta.color}`}
                    >
                      <CheckCircle2 size={16} />
                      {statusMeta.label}
                    </div>
                    <p className="text-xs text-slate-500">
                      Last updated: {formatDate(trackingData.updated_at || trackingData.eta)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-slate-200">
                    <MapPin className="text-blue-600" size={18} />
                    <div>
                      <p className="text-xs text-slate-500">Current Location</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {trackingData.location || trackingData.current_location || "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-slate-200">
                    <Truck className="text-blue-600" size={18} />
                    <div>
                      <p className="text-xs text-slate-500">Warehouse</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {trackingData.warehouse_code || "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-slate-200">
                    <Clock4 className="text-blue-600" size={18} />
                    <div>
                      <p className="text-xs text-slate-500">Order Date</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {formatDate(trackingData.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Product / SKU</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {trackingData.product_sku || trackingData.sku || "N/A"}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">ETA</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {formatDate(trackingData.eta || trackingData.expected_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* PROGRESS TRACKER */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg">
                <div className="flex justify-between mb-6">
                  {[
                    { label: "Preparing", icon: Package },
                    { label: "In Transit", icon: Truck },
                    { label: "Delivered", icon: CheckCircle2 },
                  ].map((step, index) => {
                    const active = currentStep >= index + 1;
                    const Icon = step.icon;
                    return (
                      <div key={step.label} className="flex-1 text-center">
                        <div
                          className={`mx-auto h-12 w-12 flex items-center justify-center rounded-full border-2 transition
                          ${active ? "bg-white text-slate-900 border-white shadow" : "border-white/30 text-white/70"}`}
                        >
                          <Icon size={20} />
                        </div>
                        <p className={`mt-3 text-sm font-semibold ${active ? "text-white" : "text-white/70"}`}>
                          {step.label}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="relative h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-green-300 transition-all duration-500"
                    style={{
                      width:
                        currentStep === 1
                          ? "33%"
                          : currentStep === 2
                          ? "66%"
                          : currentStep === 3
                          ? "100%"
                          : "0%",
                    }}
                  ></div>
                </div>

                <p className="mt-4 text-sm text-white/80">
                  Status: <span className="font-semibold text-white">{statusMeta.label}</span>
                </p>
              </div>

            </div>

          )}

        </div>

      )}

    </div>
  );
}
