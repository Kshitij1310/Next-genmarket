import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Activity,
  Box,
  CheckCircle,
  Clock3,
  Loader,
  Package,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import { getAllOrders } from '../../services/orderService.js';
import { subscribeOrderUpdates } from '../../utils/orderEvents';
import { inventoryService } from '../../services/inventoryService.js';
import PageContainer from '../../components/common/PageContainer';

// backend address should come from the shared configuration rather than
// being hard‑coded.  The dashboard page does not need the value directly,
// so the constant is simply removed.
const ENABLE_SHIPMENT_API = false;

const getValue = (item, keys, fallback = '-') => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return fallback;
};

const toText = (value) => {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
};

const normalizeItems = (order) =>
  Array.isArray(order?.items)
    ? order.items
    : order?.sku
      ? [{ sku: order.sku, quantity: order.quantity }]
      : [];

const cleanWarehouseCode = (code) => {
  if (!code) return '';
  return String(code).trim().replace(/\s+/g, ' ');
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const injectedOrders = Array.isArray(location.state?.injectedOrders)
    ? location.state.injectedOrders
    : [];
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ordersForMetrics, setOrdersForMetrics] = useState([]);
  const [shipmentStatus, setShipmentStatus] = useState({
    inWarehouse: 0,
    inTransit: 0,
    outForDelivery: 0,
  });
  // thresholds
  const [thresholds, setThresholds] = useState([]);
  const [loadingThresholds, setLoadingThresholds] = useState(false);
  const [thresholdError, setThresholdError] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('WH-A');
  const [capacity, setCapacity] = useState([]);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [capacityError, setCapacityError] = useState('');

  const loadThresholds = useCallback(async () => {
    try {
      setLoadingThresholds(true);
      setThresholdError('');
      const { items } = await inventoryService.getThresholds();
      setThresholds(Array.isArray(items) ? items : []);
    } catch (err) {
      setThresholdError(err?.message || 'Failed to load inventory thresholds');
    } finally {
      setLoadingThresholds(false);
    }
  }, []);

  const loadCapacity = useCallback(async () => {
    try {
      setLoadingCapacity(true);
      setCapacityError('');
      const { items } = await inventoryService.getWarehouseCapacity();
      setCapacity(Array.isArray(items) ? items : []);
    } catch (err) {
      setCapacityError(err?.message || 'Failed to load warehouse capacity');
    } finally {
      setLoadingCapacity(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
    const unsubscribe = subscribeOrderUpdates(fetchDashboardStats);
    return unsubscribe;
  }, []);

  // primary data fetches (thresholds, capacity)
  useEffect(() => {
    loadThresholds();
    loadCapacity();
  }, [loadThresholds, loadCapacity]);

  // Periodic refresh and listen for order creation events
  useEffect(() => {
    const onOrdersUpdated = () => {
      loadCapacity();
    };
    window.addEventListener('ordersUpdated', onOrdersUpdated);
    const intervalId = setInterval(() => {
      loadCapacity();
    }, 30000); // 30s polling

    return () => {
      window.removeEventListener('ordersUpdated', onOrdersUpdated);
      clearInterval(intervalId);
    };
  }, [loadCapacity]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const domBindings = [
      { id: 'totalProducts', value: stats?.total_products },
      { id: 'totalWarehouses', value: stats?.total_warehouses },
      { id: 'activeOrders', value: stats?.active_orders },
      { id: 'inTransitShipments', value: stats?.in_transit_shipments },
      { id: 'inWarehouseCount', value: shipmentStatus.inWarehouse },
      { id: 'inTransitCount', value: shipmentStatus.inTransit },
      { id: 'outForDeliveryCount', value: shipmentStatus.outForDelivery },
    ];

    domBindings.forEach(({ id, value }) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerText = typeof value === 'number' ? String(value) : value ?? '';
      }
    });
  }, [stats, shipmentStatus]);

  const fetchDashboardStats = async () => {
    try {
      setStatsLoading(true);
      setError(null);
      const fetchJson = (path) => apiFetch(path);

      const shipmentPromise = ENABLE_SHIPMENT_API
        ? fetchJson('/api/shipments?limit=500')
        : Promise.resolve({ items: [] });

      const [productsData, inventoryData, shipmentsData] = await Promise.all([
        fetchJson('/api/products?page=1&page_size=1'),
        fetchJson('/api/inventory/warehouses'),
        shipmentPromise,
      ]);

      let orders = [];
      try {
        const ordersData = await getAllOrders();
        orders = Array.isArray(ordersData?.items)
          ? ordersData.items
          : Array.isArray(ordersData)
            ? ordersData
            : [];
      } catch (ordersErr) {
        console.warn('Orders list fetch failed or unsupported:', ordersErr?.message || ordersErr);
        orders = injectedOrders;
      }

      const totalProductsRaw = Number(
        productsData?.total ?? productsData?.totalCount ?? productsData?.count ?? 0
      );
      const warehouses = Array.isArray(inventoryData?.warehouses) ? inventoryData.warehouses : [];
      const shipments = Array.isArray(shipmentsData?.items)
        ? shipmentsData.items
        : Array.isArray(shipmentsData)
          ? shipmentsData
          : [];

      const shipmentSummary = summarizeShipments(shipments);
      const calculatedStats = {
        total_products: Number.isNaN(totalProductsRaw) ? 0 : totalProductsRaw,
        total_warehouses: warehouses.length,
        active_orders: orders.length,
        in_transit_shipments: shipmentSummary.inTransit,
      };

      console.log('Dashboard API payload:', calculatedStats);
      console.log('Active Orders:', calculatedStats.active_orders);

      setStats(calculatedStats);

      // merge injected (just-created) orders to surface immediately
      const merged = [...orders];
      injectedOrders.forEach((ord) => {
        const oid = ord?.order_id ?? ord?.orderId ?? ord?.id;
        if (oid && !merged.some((o) => (o?.order_id ?? o?.orderId ?? o?.id) === oid)) {
          merged.unshift(ord);
        }
      });

      // sort newest first and cap to 8
      const sorted = merged.sort((a, b) => {
        const aDate = new Date(
          a?.created_at ||
            a?.createdAt ||
            a?.ordered_at ||
            a?.orderedAt ||
            a?.order_date ||
            a?.orderDate ||
            a?.timestamp
        ).getTime() || Number.MAX_SAFE_INTEGER;
        const bDate = new Date(
          b?.created_at ||
            b?.createdAt ||
            b?.ordered_at ||
            b?.orderedAt ||
            b?.order_date ||
            b?.orderDate ||
            b?.timestamp
        ).getTime() || Number.MAX_SAFE_INTEGER;
        if (aDate !== bDate) return bDate - aDate;
        const aId = String(a?.order_id || a?.orderId || a?.id || '');
        const bId = String(b?.order_id || b?.orderId || b?.id || '');
        return bId.localeCompare(aId);
      });

      setOrdersForMetrics(sorted);
      setShipmentStatus(shipmentSummary);
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setError('Admin access required');
        return;
      }
      setError(err.message || 'Request failed');
    } finally {
      setStatsLoading(false);
    }
  };

  const isInitialLoading = statsLoading && !stats;

  const metricSummary = useMemo(() => {
    const orders = ordersForMetrics;
    const totals = {
      totalOrders: stats?.active_orders ?? orders.length,
      totalProducts: stats?.total_products ?? 0,
      revenue: 0,
      pendingOrders: 0,
      deliveredOrders: 0,
      paymentsCompleted: 0,
      warehouses: stats?.total_warehouses ?? 0,
      todayOrders: 0,
      todayRevenue: 0,
      yesterdayOrders: 0,
      yesterdayRevenue: 0,
    };

    orders.forEach((order) => {
      const status = String(order?.status || order?.order_status || '').toLowerCase();
      const paymentStatus = String(order?.payment_status || '').toLowerCase();
      const amount = Number(order?.total_amount ?? order?.amount);
      if (!Number.isNaN(amount)) totals.revenue += amount;
      if (status.includes('deliver') || status === 'delivered' || status === 'completed') {
        totals.deliveredOrders += 1;
      } else if (
        status.includes('pending') ||
        status.includes('process') ||
        status === 'new' ||
        paymentStatus === 'pending'
      ) {
        totals.pendingOrders += 1;
      }
      if (paymentStatus === 'paid' || paymentStatus === 'completed' || paymentStatus === 'confirmed') {
        totals.paymentsCompleted += 1;
      }

      const dateValue =
        order?.created_at ||
        order?.createdAt ||
        order?.ordered_at ||
        order?.orderedAt ||
        order?.order_date ||
        order?.orderDate ||
        order?.timestamp;
      const day = dateValue ? new Date(dateValue) : null;
      if (day && !Number.isNaN(day.getTime())) {
        const today = new Date();
        const yday = new Date();
        today.setHours(0, 0, 0, 0);
        yday.setHours(0, 0, 0, 0);
        yday.setDate(yday.getDate() - 1);
        const dayOnly = new Date(day);
        dayOnly.setHours(0, 0, 0, 0);
        if (dayOnly.getTime() === today.getTime()) {
          totals.todayOrders += 1;
          if (!Number.isNaN(amount)) totals.todayRevenue += amount;
        } else if (dayOnly.getTime() === yday.getTime()) {
          totals.yesterdayOrders += 1;
          if (!Number.isNaN(amount)) totals.yesterdayRevenue += amount;
        }
      }
    });

    return totals;
  }, [ordersForMetrics, stats]);

  const ordersTrend = useMemo(() => {
    const counts = new Map();
    ordersForMetrics.forEach((order) => {
      const dateValue =
        order?.created_at ||
        order?.createdAt ||
        order?.ordered_at ||
        order?.orderedAt ||
        order?.order_date ||
        order?.orderDate ||
        order?.timestamp;
      const day = dateValue ? new Date(dateValue) : null;
      if (day && !Number.isNaN(day.getTime())) {
        const key = day.toISOString().slice(0, 10);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    const sorted = Array.from(counts.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([label, value]) => ({ label, value }));
    return sorted;
  }, [ordersForMetrics]);

  const statusDistribution = useMemo(() => {
    const bucket = new Map();
    ordersForMetrics.forEach((order) => {
      const status = String(order?.status || order?.order_status || 'unknown').toLowerCase();
      bucket.set(status, (bucket.get(status) || 0) + 1);
    });
    return Array.from(bucket.entries()).map(([status, value]) => ({
      status,
      value,
    }));
  }, [ordersForMetrics]);

  const topProducts = useMemo(() => {
    const counts = new Map();
    ordersForMetrics.forEach((order) => {
      const items = normalizeItems(order);
      items.forEach((item) => {
        const name = item?.name || item?.product_name || item?.sku || 'Product';
        counts.set(name, (counts.get(name) || 0) + (Number(item?.quantity) || 1));
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));
  }, [ordersForMetrics]);

  const systemMetrics = useMemo(() => {
    const activeOrders = ordersForMetrics.length;
    let totalQty = 0;
    ordersForMetrics.forEach((order) => {
      normalizeItems(order).forEach((item) => {
        totalQty += Number(item?.quantity) || 0;
      });
    });
    const avgOrderQty = activeOrders ? (totalQty / activeOrders).toFixed(1) : 0;
    return {
      activeOrders,
      avgOrderQty,
      totalProducts: stats?.total_products ?? 0,
      warehouses: stats?.total_warehouses ?? 0,
    };
  }, [ordersForMetrics, stats]);

  const warehouseOptions = useMemo(() => {
    const set = new Set();
    thresholds.forEach((item) => {
      const code = cleanWarehouseCode(item?.warehouse_code);
      if (code) set.add(code);
    });
    if (capacity.length) {
      capacity.forEach((c) => {
        const code = cleanWarehouseCode(c?.warehouse_code);
        if (code) set.add(code);
      });
    }
    return Array.from(set).sort();
  }, [thresholds, capacity]);

  useEffect(() => {
    if (!selectedWarehouse && warehouseOptions.length) {
      setSelectedWarehouse(warehouseOptions[0]);
    }
  }, [warehouseOptions, selectedWarehouse]);

  const filteredThresholds = useMemo(() => {
    if (!selectedWarehouse) return thresholds;
    return thresholds.filter((item) => cleanWarehouseCode(item.warehouse_code) === selectedWarehouse);
  }, [thresholds, selectedWarehouse]);

  const capacityData = useMemo(() => {
    if (capacity.length) {
      return capacity
        .map((c) => ({
          code: cleanWarehouseCode(c.warehouse_code) || 'Unknown',
          name: c.warehouse_name || '',
          region: c.region || '',
          max: Number(c.capacity_units || 0),
          used: Number(c.current_utilization || 0),
          remaining: Number(c.remaining_capacity || 0),
          min: Number(c.capacity_units || 0) - Number(c.remaining_capacity || 0), // placeholder since min not provided
          count: c.category_limits ? Object.keys(c.category_limits).length : 0,
          categories: c.category_limits || {},
          catUsed: c.category_utilization || {},
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    // fallback to thresholds aggregation if capacity not available
    const grouped = new Map();
    thresholds.forEach((item) => {
      const code = cleanWarehouseCode(item.warehouse_code) || 'Unknown';
      if (!grouped.has(code)) grouped.set(code, { code, max: 0, min: 0, count: 0, remaining: 0, used: 0, name: '', region: '', categories: {}, catUsed: {} });
      const entry = grouped.get(code);
      entry.max += Number(item.max_qty || 0);
      entry.min += Number(item.min_qty || 0);
      entry.count += 1;
      entry.remaining = Math.max(0, entry.max - entry.used);
    });
    return Array.from(grouped.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [capacity, thresholds]);

  const categoryCapacity = useMemo(() => {
    const agg = new Map();
    capacity.forEach((wh) => {
      Object.entries(wh.category_limits || {}).forEach(([cat, limit]) => {
        const used = (wh.category_utilization || {})[cat] || 0;
        if (!agg.has(cat)) agg.set(cat, { category: cat, limit: 0, used: 0 });
        const entry = agg.get(cat);
        entry.limit += Number(limit || 0);
        entry.used += Number(used || 0);
      });
    });
    return Array.from(agg.values()).sort((a, b) => a.category.localeCompare(b.category));
  }, [capacity]);



  return (
    <PageContainer className="bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="page-container max-w-7xl mx-auto">
        <div className="page-header mb-6 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</p>
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <h1 className="page-title text-3xl font-bold text-slate-900">Marketplace Analytics</h1>
              <p className="page-subtitle mt-1 text-sm text-slate-600">Analysis</p>
            </div>
            
          </div>
        </div>

        {isInitialLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="animate-spin text-blue-500" size={36} />
          </div>
        ) : error ? (
          <div className="surface-card bg-white shadow-xl rounded-xl p-8 text-center">
            <p className="text-red-600 font-semibold">Error: {error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                icon={ShoppingBag}
                title="Total Orders"
                value={metricSummary.totalOrders}
                tone="info"
              />
              <StatCard
                icon={Clock3}
                title="Pending Orders"
                value={metricSummary.pendingOrders}
                tone="warning"
              />
              <StatCard
                icon={CheckCircle}
                title="Completed Orders"
                value={metricSummary.deliveredOrders}
                tone="success"
              />
              <StatCard
                icon={TrendingUp}
                title="Total Revenue"
                value={
                  metricSummary.revenue > 0
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metricSummary.revenue)
                    : '$0'
                }
                tone="success"
              />
            </div>

            {/* Middle: Warehouse utilization + capacity overview */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 items-stretch">
              <div className="surface-card bg-white shadow-xl rounded-2xl p-6 xl:col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Warehouse Utilization</h2>
                    <p className="text-sm text-slate-500 mt-1">Used vs remaining capacity per warehouse</p>
                  </div>
                  {loadingCapacity && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader className="animate-spin" size={14} /> Loading
                    </div>
                  )}
                </div>
                {capacityError ? (
                  <p className="mt-4 text-sm text-rose-600">{capacityError}</p>
                ) : (
                  <WarehouseUtilizationChart data={capacityData} />
                )}
              </div>
              <div className="surface-card bg-white shadow-xl rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Warehouse Capacity Overview</h2>
                    <p className="text-sm text-slate-500 mt-1">Capacity, utilization, and remaining</p>
                  </div>
                </div>
                {capacityError ? (
                  <p className="mt-4 text-sm text-rose-600">{capacityError}</p>
                ) : (
                  <CapacityChart data={capacityData} />
                )}
              </div>
            </div>

            {/* Bottom: Threshold analysis + category utilization */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-stretch">
              <div className="surface-card bg-white shadow-xl rounded-2xl p-6 lg:col-span-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Inventory Threshold Analysis</h2>
                    <p className="text-sm text-slate-500 mt-1">Min vs Max by SKU</p>
                  </div>
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="form-input border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  >
                    {warehouseOptions.map((wh) => (
                      <option key={wh} value={wh}>{wh}</option>
                    ))}
                  </select>
                </div>
                {loadingThresholds ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-4">
                    <Loader className="animate-spin" size={18} /> Loading thresholds...
                  </div>
                ) : thresholdError ? (
                  <p className="mt-4 text-sm text-rose-600">{thresholdError}</p>
                ) : (
                  <ThresholdChart products={filteredThresholds} />
                )}
              </div>
              <div className="surface-card bg-white shadow-xl rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Inventory Category Capacity</h2>
                    <p className="text-sm text-slate-500 mt-1">Capacity vs utilization by category</p>
                  </div>
                </div>
                <CategoryCapacityChart data={categoryCapacity} />
              </div>
            </div>

            {/* top products row */}
            <div className="grid grid-cols-1 mb-8">
              <div className="surface-card bg-white shadow-xl rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-slate-900">Top Selling Products</h2>
                <TopProductsList products={topProducts} />
              </div>
            </div>

            {/* system insights row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <InsightCard
                icon={Activity}
                title="Active Orders"
                value={systemMetrics.activeOrders}
              />
              <InsightCard
                icon={Package}
                title="Avg Order Qty"
                value={systemMetrics.avgOrderQty}
              />
              <InsightCard
                icon={ShoppingBag}
                title="Total Products"
                value={systemMetrics.totalProducts}
              />
              <InsightCard
                icon={Box}
                title="Warehouses"
                value={systemMetrics.warehouses}
              />
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
};

const toneClasses = {
  info: 'from-blue-500 via-blue-600 to-indigo-600 text-white',
  success: 'from-emerald-500 via-emerald-600 to-teal-600 text-white',
  warning: 'from-amber-500 via-amber-600 to-orange-600 text-white',
  danger: 'from-rose-500 via-rose-600 to-red-600 text-white',
};


const StatCard = ({ icon: Icon, title, value, badge, tone = 'info', domId }) => (
  <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl p-5 flex flex-col gap-3">
    <div className={`absolute inset-0 opacity-60 blur-3xl bg-gradient-to-br ${toneClasses[tone] || toneClasses.info}`} />
    {/* icon in corner */}
    <Icon className="absolute top-4 right-4 h-6 w-6 text-white/50" />
    {badge && (
      <span className="relative z-10 text-xs font-semibold px-3 py-1 rounded-full bg-white/80 text-slate-700 border border-white">
        {badge}
      </span>
    )}
    <p className="relative z-10 text-sm text-slate-700">{title}</p>
    <p id={domId} className="relative z-10 text-3xl font-bold text-slate-900 tracking-tight">
      {value ?? '—'}
    </p>
  </div>
);

const InsightCard = ({ icon: Icon, title, value }) => (
  <div className="relative overflow-hidden rounded-xl bg-white shadow-md p-4 flex items-center gap-3 hover:shadow-lg transition">
    <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
      <Icon className="h-6 w-6 text-blue-600" />
    </div>
    <div>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  </div>
);

const StatusPill = ({ status, tone = 'payment' }) => {
  const key = String(status || '').toLowerCase();
  const toneMap =
    tone === 'order'
      ? {
          delivered: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          pending: 'bg-amber-50 text-amber-700 border-amber-100',
          processing: 'bg-amber-50 text-amber-700 border-amber-100',
          cancelled: 'bg-rose-50 text-rose-700 border-rose-100',
          failed: 'bg-rose-50 text-rose-700 border-rose-100',
          default: 'bg-blue-50 text-blue-700 border-blue-100',
        }
      : {
          paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          pending: 'bg-amber-50 text-amber-700 border-amber-100',
          failed: 'bg-rose-50 text-rose-700 border-rose-100',
          default: 'bg-blue-50 text-blue-700 border-blue-100',
        };
  const cls = toneMap[key] || toneMap.default;
  const label = status ? String(status).replace(/_/g, ' ') : '—';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border ${cls}`}>
      <span className="h-2 w-2 rounded-full bg-current opacity-75" />
      <span className="capitalize">{label}</span>
    </span>
  );
};



const OrdersTrendChart = ({ data }) => {
  const width = 900;
  const height = 220;
  if (!data || data.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
        <h4 className="text-sm font-semibold text-slate-800 mb-2">Warehouse Operations Overview</h4>
        <p className="text-sm text-slate-600">No order time-series yet. Use the warehouse analytics below for operational insight.</p>
      </div>
    );
  }
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((d, idx) => {
      const x = idx * stepX;
      const y = height - (d.value / maxVal) * (height - 30) - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="mt-6">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-full"
          role="img"
          aria-label="Orders trend line chart"
        >
          <polyline
            fill="none"
            stroke="url(#trendGradient)"
            strokeWidth="4"
            points={points}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#a5b4fc" />
            </linearGradient>
          </defs>
          {data.map((d, idx) => {
            const x = idx * stepX;
            const y = height - (d.value / maxVal) * (height - 30) - 10;
            return (
              <g key={d.label}>
                <circle cx={x} cy={y} r="4" fill="#2563eb" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-500">
        {data.slice(-8).map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
            <span>{d.label}</span>
            <span className="text-slate-700 font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const OrderStatusDonut = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No status data.</p>;
  }
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ['#2563eb', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#0ea5e9'];
  let cumulative = 0;
  const segments = data.map((d, idx) => {
    const start = cumulative / total;
    const sweep = d.value / total;
    cumulative += d.value;
    return { ...d, color: colors[idx % colors.length], start, sweep };
  });

  return (
    <div className="mt-6 flex items-center gap-6">
      <div
        className="relative h-44 w-44 rounded-full"
        style={{
          background: `conic-gradient(${segments
            .map((s) => `${s.color} ${s.start * 360}deg ${(s.start + s.sweep) * 360}deg`)
            .join(',')})`,
        }}
      >
        <div className="absolute inset-6 rounded-full bg-white flex items-center justify-center shadow-inner">
          <div className="text-center">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-xl font-bold text-slate-900">{total}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {segments.map((s) => (
          <div key={s.status} className="flex items-center gap-3">
            <span className="inline-flex h-3 w-3 rounded-full" style={{ background: s.color }} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 capitalize">{s.status}</p>
              <p className="text-xs text-slate-500">
                {s.value} orders · {Math.round((s.value / total) * 100)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TopProductsList = ({ products }) => {
  if (!products || products.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No product data.</p>;
  }
  const maxVal = Math.max(...products.map((p) => p.total), 1);
  return (
    <div className="mt-4 space-y-3">
      {products.map((product, idx) => (
        <div
          key={product.name + idx}
          className="flex items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3 bg-slate-50/70 hover:shadow-md transition"
        >
          <span className="text-sm font-bold text-slate-500 w-6 text-center">#{idx + 1}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">{product.name}</p>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${(product.total / maxVal) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-semibold text-slate-900">{product.total}</span>
        </div>
      ))}
    </div>
  );
};


const CapacityChart = ({ data }) => {
  if (!data || data.length === 0) return <p className="mt-6 text-sm text-slate-500">No capacity data.</p>;
  const maxCapacity = Math.max(...data.map((d) => d.max), 1);
  return (
    <div className="mt-4 space-y-3">
      {data.map((wh) => (
        <div key={wh.code} className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
            <div>
              <p>{wh.code}</p>
              {wh.name && <p className="text-xs text-slate-500">{wh.name}</p>}
              {wh.region && <p className="text-[11px] text-slate-500">Region: {wh.region}</p>}
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>{wh.count} products</p>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="text-xs text-slate-600">Max Capacity</div>
            <div className="h-3 rounded-full bg-slate-200 overflow-hidden" title={`Max capacity ${wh.max}`}>
              <div
                className="h-3 bg-indigo-500"
                style={{ width: `${(wh.max / maxCapacity) * 100}%` }}
              />
            </div>
            <div className="text-xs text-slate-600">Min Threshold</div>
            <div className="h-2 rounded-full bg-green-200 overflow-hidden" title={`Min threshold ${wh.min}`}>
              <div
                className="h-2 bg-green-500"
                style={{ width: `${wh.max ? (wh.min / wh.max) * 100 : 0}%` }}
              />
            </div>
            <div className="text-xs text-slate-600">Remaining</div>
            <div className="h-2 rounded-full bg-amber-200 overflow-hidden" title={`Remaining ${wh.remaining}`}>
              <div
                className="h-2 bg-amber-500"
                style={{ width: `${wh.max ? (wh.remaining / wh.max) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-600 flex gap-3 flex-wrap">
            <span>Max: {wh.max}</span>
            <span>Min: {wh.min}</span>
            <span>Remaining: {wh.remaining}</span>
            <span>
              Utilization:{' '}
              {wh.max ? Math.round(((wh.max - wh.remaining) / wh.max) * 100) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const ThresholdChart = ({ products }) => {
  if (!products || products.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No threshold data for this warehouse.</p>;
  }
  const maxQty = Math.max(...products.map((p) => Number(p.max_qty) || 0), 1);
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Max Qty</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Min Qty</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${products.length}, minmax(90px,1fr))`, gap: '16px' }}>
          {products.map((p) => {
            const maxVal = Number(p.max_qty) || 0;
            const minVal = Number(p.min_qty) || 0;
            return (
              <div key={`${p.sku}-${p.warehouse_code}`} className="flex flex-col gap-2 items-center">
                <div className="h-44 w-full relative rounded-lg bg-slate-100 overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-indigo-500"
                    style={{ height: `${(maxVal / maxQty) * 100}%`, transition: 'height 0.3s ease' }}
                    title={`Max: ${maxVal}`}
                  />
                  <div
                    className="absolute left-0 right-0 border-t-2 border-amber-400"
                    style={{ bottom: `${(minVal / maxQty) * 100}%` }}
                    title={`Min: ${minVal}`}
                  />
                </div>
                <div className="text-[11px] text-center text-slate-700 font-semibold truncate w-full" style={{ transform: 'rotate(-10deg)' }} title={p.sku}>{p.sku}</div>
                <div className="text-[11px] text-slate-500">Max {maxVal} · Min {minVal}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


const WarehouseUtilizationChart = ({ data }) => {
  if (!data || data.length === 0) return <p className="mt-6 text-sm text-slate-500">No capacity data.</p>;
  return (
    <div className="mt-4 space-y-3">
      {data.map((wh) => {
        const rawUsedPct = wh.max ? (wh.used / wh.max) * 100 : 0;
        const rawRemainingPct = wh.max ? (wh.remaining / wh.max) * 100 : 0;
        const barUsed = Math.max(0, Math.min(100, rawUsedPct));
        const barRemaining = Math.max(0, Math.min(100 - barUsed, rawRemainingPct));
        const usedPct = Math.round(barUsed);
        const remainingPct = Math.round(barRemaining);
        return (
          <div key={wh.code} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
              <span>{wh.code}</span>
              <span className="text-xs text-slate-500">Capacity: {wh.max}</span>
            </div>
            <div className="mt-2 h-4 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-4 bg-indigo-500 inline-block"
                style={{ width: `${barUsed}%` }}
                title={`Used: ${wh.used}`}
              />
              <div
                className="h-4 bg-emerald-400 inline-block"
                style={{ width: `${barRemaining}%` }}
                title={`Remaining: ${wh.remaining}`}
              />
            </div>
            <div className="mt-1 text-xs text-slate-600 flex gap-3 flex-wrap">
              <span>Used: {wh.used} ({usedPct}%)</span>
              <span>Remaining: {wh.remaining} ({remainingPct}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CategoryCapacityChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No category data.</p>;
  }
  if (data.every((c) => !c.limit || Number(c.limit) === 0)) {
    return <p className="mt-6 text-sm text-slate-500">No category limits configured.</p>;
  }
  const maxLimit = Math.max(...data.map((d) => d.limit), 1);
  return (
    <div className="mt-4 space-y-3">
      {data.map((cat) => (
        <div key={cat.category} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-900 capitalize">
            <span>{cat.category}</span>
            <span className="text-xs text-slate-500">Limit: {cat.limit}</span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-3 bg-indigo-500"
              style={{ width: `${(cat.limit / maxLimit) * 100}%` }}
              title={`Limit: ${cat.limit}`}
            />
          </div>
          <div className="mt-1 h-2 rounded-full bg-emerald-200 overflow-hidden">
            <div
              className="h-2 bg-emerald-500"
              style={{ width: `${cat.limit ? (cat.used / cat.limit) * 100 : 0}%` }}
              title={`Used: ${cat.used}`}
            />
          </div>
          <div className="mt-1 text-xs text-slate-600 flex gap-3">
            <span>Used: {cat.used}</span>
            <span>Remaining: {cat.limit - cat.used}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const summarizeShipments = (shipments) => {
  const summary = {
    inWarehouse: 0,
    inTransit: 0,
    outForDelivery: 0,
  };

  if (!Array.isArray(shipments)) {
    return summary;
  }

  shipments.forEach((shipment) => {
    const status = String(shipment?.status || '').toLowerCase();
    if (status === 'in_warehouse' || status === 'preparing') {
      summary.inWarehouse += 1;
    } else if (status === 'in_transit' || status === 'transit') {
      summary.inTransit += 1;
    } else if (status === 'out_for_delivery') {
      summary.outForDelivery += 1;
    }
  });

  return summary;
};

export default AdminDashboard;
