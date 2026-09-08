import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Activity,
  Box,
  CheckCircle,
  Clock3,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Loader,
  Package,
  ShoppingBag,
  TrendingUp,
  Warehouse,
  BarChart2,
  PieChart,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import { getAllOrders } from '../../services/orderService.js';
import { subscribeOrderUpdates } from '../../utils/orderEvents';
import { inventoryService } from '../../services/inventoryService.js';
import { revenueService } from '../../services/revenueService.js';
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

const resolveOrderDate = (order) => {
  const dateValue =
    order?.created_at ||
    order?.createdAt ||
    order?.ordered_at ||
    order?.orderedAt ||
    order?.order_date ||
    order?.orderDate ||
    order?.timestamp;
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

// Return a YYYY-MM-DD key in the user's local time zone (avoids UTC shift when using toISOString).
const getLocalDateKey = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Parse a YYYY-MM-DD key into a Date anchored in local time (avoids UTC shift).
const parseLocalDateKey = (key) => {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day); // local midnight
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
  const [selectedWarehouse, setSelectedWarehouse] = useState('All Warehouses');
  const [selectedCapacityWarehouse, setSelectedCapacityWarehouse] = useState('All Warehouses');
  const [selectedCategoryWarehouse, setSelectedCategoryWarehouse] = useState('All Warehouses');
  const [capacity, setCapacity] = useState([]);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [capacityError, setCapacityError] = useState('');
  const [warehouseStock, setWarehouseStock] = useState({});
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState('');
  const [inventoryWarehouses, setInventoryWarehouses] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All Categories');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All Statuses');
  const [revenueSummary, setRevenueSummary] = useState({ total: null });

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
      // perform recalculation first, but don't rely on its return value for the
      // shape of the data since it only contains utilization info.  We always
      // fetch the full warehouse capacity record afterwards so that
      // `category_limits` and other metadata remain available to the charts.
      try {
        await inventoryService.recalcWarehouseCapacity();
      } catch (recalcErr) {
        console.warn('Recalc capacity failed, continuing to fetch existing data:', recalcErr?.message || recalcErr);
      }
      // get the current snapshot of warehouse capacity (includes category limits)
      const snapshot = await inventoryService.getWarehouseCapacity();
      const items = Array.isArray(snapshot?.items) ? snapshot.items : Array.isArray(snapshot) ? snapshot : [];
      setCapacity(items);
    } catch (err) {
      setCapacityError(err?.message || 'Failed to load warehouse capacity');
    } finally {
      setLoadingCapacity(false);
    }
  }, []);

  const loadWarehouseStock = useCallback(
    async (code) => {
      if (!code) return;
      try {
        setLoadingStock(true);
        setStockError('');
        const { list } = await inventoryService.getWarehouseProducts(code);
        const stockMap = {};
        (Array.isArray(list) ? list : []).forEach((item) => {
          const sku = item?.sku || item?.SKU || item?.product_sku;
          const qtyRaw = item?.quantity ?? item?.qty ?? item?.available_qty ?? item?.stock;
          const qty = Number(qtyRaw);
          if (sku) stockMap[sku] = Number.isFinite(qty) ? qty : 0;
        });
        setWarehouseStock((prev) => ({ ...prev, [code]: stockMap }));
      } catch (err) {
        setStockError(err?.message || 'Unable to load current stock for this warehouse');
      } finally {
        setLoadingStock(false);
      }
    },
    []
  );

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
      let revenueTotal = null;
      try {
        const revenueRows = await revenueService.getRevenueForWarehouses(warehouses);
        revenueTotal = revenueRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row?.total_revenue_usd ??
                row?.total_revenue ??
                row?.revenue ??
                row?.stripe_revenue_usd ??
                0
            ),
          0
        );
      } catch (revErr) {
        console.warn('Dashboard revenue fetch failed:', revErr?.message || revErr);
      }

      const shipmentSummary = summarizeShipments(shipments);
      const calculatedStats = {
        total_products: Number.isNaN(totalProductsRaw) ? 0 : totalProductsRaw,
        total_warehouses: warehouses.length,
        active_orders: orders.length,
        in_transit_shipments: shipmentSummary.inTransit,
      };

      console.log('Dashboard API payload:', calculatedStats);
      console.log('Active Orders:', calculatedStats.active_orders);

      setInventoryWarehouses(warehouses);
      setStats(calculatedStats);
      setRevenueSummary({
        total: Number.isFinite(revenueTotal) ? revenueTotal : null,
      });

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

  const inventoryCategoryData = useMemo(() => {
    const categoryMap = new Map();
    const categorySet = new Set();
    inventoryWarehouses.forEach((warehouse) => {
      const products = Array.isArray(warehouse?.products) ? warehouse.products : [];
      products.forEach((item) => {
        const sku = item?.sku || item?.SKU || item?.product_sku;
        const category = item?.category || item?.attributes?.category;
        if (sku && category) {
          categoryMap.set(String(sku), String(category));
          categorySet.add(String(category));
        }
      });
    });
    return {
      map: categoryMap,
      categories: Array.from(categorySet).sort(),
    };
  }, [inventoryWarehouses]);

  const categoryOptions = useMemo(
    () => ['All Categories', ...inventoryCategoryData.categories],
    [inventoryCategoryData]
  );

  const statusOptions = useMemo(() => {
    const set = new Set();
    ordersForMetrics.forEach((order) => {
      const status = String(order?.status || order?.order_status || '').toLowerCase();
      if (status) set.add(status);
    });
    return ['All Statuses', ...Array.from(set).sort()];
  }, [ordersForMetrics]);

  const filtersActive =
    Boolean(dateRange.start) ||
    Boolean(dateRange.end) ||
    selectedCategoryFilter !== 'All Categories' ||
    selectedStatusFilter !== 'All Statuses';

  const filteredOrders = useMemo(() => {
    let list = Array.isArray(ordersForMetrics) ? [...ordersForMetrics] : [];
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start ? new Date(`${dateRange.start}T00:00:00`) : null;
      const end = dateRange.end ? new Date(`${dateRange.end}T23:59:59`) : null;
      list = list.filter((order) => {
        const date = resolveOrderDate(order);
        if (!date) return false;
        if (start && date < start) return false;
        if (end && date > end) return false;
        return true;
      });
    }
    if (selectedStatusFilter !== 'All Statuses') {
      const target = selectedStatusFilter.toLowerCase();
      list = list.filter((order) => {
        const status = String(order?.status || order?.order_status || '').toLowerCase();
        return status.includes(target);
      });
    }
    if (selectedCategoryFilter !== 'All Categories') {
      const categoryMap = inventoryCategoryData.map;
      list = list.filter((order) => {
        const items = normalizeItems(order);
        return items.some((item) => {
          const sku = item?.sku || item?.SKU || item?.product_sku;
          return sku && categoryMap.get(String(sku)) === selectedCategoryFilter;
        });
      });
    }
    return list;
  }, [
    ordersForMetrics,
    dateRange,
    selectedStatusFilter,
    selectedCategoryFilter,
    inventoryCategoryData,
  ]);

  const metricSummary = useMemo(() => {
    const orders = filteredOrders;
    const revenueOverride = Number.isFinite(revenueSummary.total) ? revenueSummary.total : null;
    const totals = {
      totalOrders: filtersActive ? orders.length : stats?.active_orders ?? orders.length,
      totalWarehouses: stats?.total_warehouses ?? 0,
      revenue: revenueOverride ?? 0,
      revenueHasData: revenueOverride !== null,
      pendingOrders: 0,
      shippedOrders: 0, // retained for internal counts though no card shown
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
      const amount =
        revenueOverride !== null
          ? null
          : Number(
              order?.total_amount ??
                order?.amount ??
                order?.total ??
                order?.total_price ??
                order?.price
            );
      if (revenueOverride === null && !Number.isNaN(amount)) {
        totals.revenue += amount;
        totals.revenueHasData = true;
      }

      // Pending alignment: match Order Management filter logic (status includes 'pending')
      if (status.includes('pending')) {
        totals.pendingOrders += 1;
      }

      if (status.includes('deliver') || status === 'delivered' || status === 'completed') {
        totals.deliveredOrders += 1;
      } else if (status.includes('ship') || status.includes('transit')) {
        totals.shippedOrders += 1;
      }

      if (paymentStatus === 'paid' || paymentStatus === 'completed' || paymentStatus === 'confirmed') {
        totals.paymentsCompleted += 1;
      }

      const day = resolveOrderDate(order);
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
  }, [filteredOrders, stats, filtersActive, revenueSummary]);

  const ordersTrend = useMemo(() => {
    const counts = new Map();
    filteredOrders.forEach((order) => {
      const day = resolveOrderDate(order);
      const key = day ? getLocalDateKey(day) : null;
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    const sorted = Array.from(counts.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([label, value]) => ({ label, value }));
    return sorted;
  }, [filteredOrders]);

  const revenueTrend = useMemo(() => {
    const sums = new Map();
    filteredOrders.forEach((order) => {
      const day = resolveOrderDate(order);
      const amount = Number(
        order?.total_amount ??
          order?.amount ??
          order?.total ??
          order?.total_price ??
          order?.price
      );
      const key = day ? getLocalDateKey(day) : null;
      if (key && !Number.isNaN(amount)) {
        sums.set(key, (sums.get(key) || 0) + amount);
      }
    });
    return Array.from(sums.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([label, value]) => ({ label, value }));
  }, [filteredOrders]);

  const statusDistribution = useMemo(() => {
    const bucket = new Map();
    filteredOrders.forEach((order) => {
      const status = String(order?.status || order?.order_status || 'unknown').toLowerCase();
      bucket.set(status, (bucket.get(status) || 0) + 1);
    });
    return Array.from(bucket.entries()).map(([status, value]) => ({
      status,
      value,
    }));
  }, [filteredOrders]);

  const topProducts = useMemo(() => {
    const counts = new Map();
    filteredOrders.forEach((order) => {
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
  }, [filteredOrders]);

  const systemMetrics = useMemo(() => {
    const activeOrders = filteredOrders.length;
    let totalQty = 0;
    filteredOrders.forEach((order) => {
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
  }, [filteredOrders, stats]);

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
    const list = Array.from(set).sort();
    return ['All Warehouses', ...list];
  }, [thresholds, capacity]);

  useEffect(() => {
    if (!selectedWarehouse) return;
    if (selectedWarehouse === 'All Warehouses') {
      warehouseOptions
        .filter((code) => code !== 'All Warehouses')
        .forEach((code) => {
          if (!warehouseStock[code]) {
            loadWarehouseStock(code);
          }
        });
      return;
    }
    loadWarehouseStock(selectedWarehouse);
  }, [selectedWarehouse, warehouseOptions, warehouseStock, loadWarehouseStock]);

  // Options used by the category capacity card; includes an "All" entry.
  const capacityWarehouseOptions = useMemo(() => {
    const codes = new Set();
    capacity.forEach((c) => {
      const code = cleanWarehouseCode(c?.warehouse_code);
      if (code) codes.add(code);
    });
    const list = Array.from(codes).sort();
    return ['All Warehouses', ...list];
  }, [capacity]);


  useEffect(() => {
    // if the previously selected warehouse is removed or invalid, reset to All
    if (
      selectedCapacityWarehouse &&
      capacityWarehouseOptions.length &&
      !capacityWarehouseOptions.includes(selectedCapacityWarehouse)
    ) {
      setSelectedCapacityWarehouse('All Warehouses');
    }
  }, [capacityWarehouseOptions, selectedCapacityWarehouse]);

  useEffect(() => {
    if (
      selectedCategoryWarehouse &&
      capacityWarehouseOptions.length &&
      !capacityWarehouseOptions.includes(selectedCategoryWarehouse)
    ) {
      setSelectedCategoryWarehouse('All Warehouses');
    }
  }, [capacityWarehouseOptions, selectedCategoryWarehouse]);


  useEffect(() => {
    if (
      selectedWarehouse &&
      warehouseOptions.length &&
      !warehouseOptions.includes(selectedWarehouse)
    ) {
      setSelectedWarehouse('All Warehouses');
    }
  }, [warehouseOptions, selectedWarehouse]);

  useEffect(() => {
    if (categoryOptions.length && !categoryOptions.includes(selectedCategoryFilter)) {
      setSelectedCategoryFilter('All Categories');
    }
  }, [categoryOptions, selectedCategoryFilter]);

  useEffect(() => {
    if (statusOptions.length && !statusOptions.includes(selectedStatusFilter)) {
      setSelectedStatusFilter('All Statuses');
    }
  }, [statusOptions, selectedStatusFilter]);

  const filteredThresholds = useMemo(() => {
    if (!selectedWarehouse || selectedWarehouse === 'All Warehouses') return thresholds;
    return thresholds.filter((item) => cleanWarehouseCode(item.warehouse_code) === selectedWarehouse);
  }, [thresholds, selectedWarehouse]);

  const thresholdsWithStock = useMemo(
    () =>
      filteredThresholds.map((item) => {
        const sku = item?.sku;
        const code = cleanWarehouseCode(item?.warehouse_code) || selectedWarehouse;
        const stockMap = warehouseStock[code] || {};
        const currentQty = stockMap[sku];
        return {
          ...item,
          current_qty: Number.isFinite(Number(currentQty)) ? Number(currentQty) : null,
        };
      }),
    [filteredThresholds, warehouseStock, selectedWarehouse]
  );

  const lowestStockProducts = useMemo(() => {
    const list = [...thresholdsWithStock];
    list.sort((a, b) => {
      const aQty = Number.isFinite(Number(a.current_qty)) ? Number(a.current_qty) : Number.POSITIVE_INFINITY;
      const bQty = Number.isFinite(Number(b.current_qty)) ? Number(b.current_qty) : Number.POSITIVE_INFINITY;
      if (aQty !== bQty) return aQty - bQty;
      return String(a.sku || '').localeCompare(String(b.sku || ''));
    });
    return list.slice(0, 5);
  }, [thresholdsWithStock]);

  const capacityData = useMemo(() => {
    if (capacity.length) {
      return capacity
        .map((c) => {
          const categoryLimits = c.category_limits || {};
          const usedFromCategories = Object.values(categoryLimits).reduce(
            (sum, val) => sum + (Number(val) || 0),
            0
          );
          const maxCap = Number(c.capacity_units || 0);
          const used = usedFromCategories || Number(c.current_utilization || 0);
          const remaining = Math.max(0, maxCap - used);
          return {
            code: cleanWarehouseCode(c.warehouse_code) || 'Unknown',
            name: c.warehouse_name || '',
            region: c.region || '',
            max: maxCap,
            used,
            remaining,
            min: maxCap - remaining, // aligns with used capacity
            count: Object.keys(categoryLimits).length,
            categories: categoryLimits,
            catUsed: c.category_utilization || {},
          };
        })
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
    // optionally restrict to a single warehouse before aggregating
    const list =
      selectedCategoryWarehouse && selectedCategoryWarehouse !== 'All Warehouses'
        ? capacity.filter(
            (wh) => cleanWarehouseCode(wh.warehouse_code) === selectedCategoryWarehouse
          )
        : capacity;
    list.forEach((wh) => {
      Object.entries(wh.category_limits || {}).forEach(([cat, limit]) => {
        const used = (wh.category_utilization || {})[cat] || 0;
        if (!agg.has(cat)) agg.set(cat, { category: cat, limit: 0, used: 0 });
        const entry = agg.get(cat);
        entry.limit += Number(limit || 0);
        entry.used += Number(used || 0);
      });
    });
    const sorted = Array.from(agg.values()).sort((a, b) => (b.used || 0) - (a.used || 0));
    if (sorted.length <= 5) {
      return sorted;
    }
    const top = sorted.slice(0, 5);
    const remainder = sorted.slice(5).reduce(
      (acc, item) => {
        acc.limit += Number(item.limit || 0);
        acc.used += Number(item.used || 0);
        return acc;
      },
      { category: 'Others', limit: 0, used: 0 }
    );
    return remainder.used || remainder.limit ? [...top, remainder] : top;
  }, [capacity, selectedCategoryWarehouse]);

  const overallCapacity = useMemo(() => {
    if (!capacityData || capacityData.length === 0) {
      return { max: 0, used: 0, remaining: 0, utilization: null };
    }
    const totals = capacityData.reduce(
      (acc, wh) => {
        acc.max += Number(wh.max || 0);
        acc.used += Number(wh.used || 0);
        acc.remaining += Number(wh.remaining || 0);
        return acc;
      },
      { max: 0, used: 0, remaining: 0 }
    );
    const utilization = totals.max ? Math.round((totals.used / totals.max) * 100) : null;
    return { ...totals, utilization };
  }, [capacityData]);

  const filteredCapacity = useMemo(() => {
    if (selectedCapacityWarehouse === 'All Warehouses') {
      return overallCapacity;
    }
    const match = capacityData.find(
      (item) => cleanWarehouseCode(item.code || item.warehouse_code) === selectedCapacityWarehouse
    );
    if (!match) {
      return { max: 0, used: 0, remaining: 0, utilization: null };
    }
    const utilization = match.max ? Math.round((match.used / match.max) * 100) : null;
    return { max: match.max, used: match.used, remaining: match.remaining, utilization };
  }, [capacityData, overallCapacity, selectedCapacityWarehouse]);

  const lowStockCount = useMemo(() => {
    const measurable = thresholdsWithStock.filter((item) => Number.isFinite(Number(item.current_qty)));
    if (measurable.length === 0) return null;
    return measurable.filter((item) => Number(item.current_qty) < Number(item.min_qty || 0)).length;
  }, [thresholdsWithStock]);



  return (
    <PageContainer className="bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="page-container max-w-7xl mx-auto">
        <div className="page-header mb-6 flex flex-col gap-2 border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</p>
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-8 w-8 text-indigo-600" />
                <h1 className="page-title text-3xl font-bold text-slate-900">Admin Panel Dashboard</h1>
              </div>
              <p className="page-subtitle mt-1 text-sm text-slate-600">Overview</p>
            </div>
            <button
              type="button"
              onClick={fetchDashboardStats}
              className="btn btn-sm btn-outline">
              Refresh
            </button>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
              <StatCard
                icon={ShoppingBag}
                title="Total Orders"
                value={metricSummary.totalOrders}
                tone="info"
                onClick={() => navigate('/admin/order-management')}
              />
              <StatCard
                icon={TrendingUp}
                title="Total Revenue"
                value={
                  metricSummary.revenueHasData
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metricSummary.revenue)
                    : 'No Data'
                }
                tone="success"
                onClick={() => navigate('/admin/revenue-details')}
              />
              <StatCard
                icon={Warehouse}
                title="Total Warehouses"
                value={metricSummary.totalWarehouses}
                tone="info"
                onClick={() => navigate('/admin/inventory')}
              />
              <StatCard
                icon={Clock3}
                title="Pending Orders"
                value={metricSummary.pendingOrders}
                tone="warning"
                onClick={() => navigate('/admin/order-management', { state: { presetFilter: 'pending' } })}
              />
              <StatCard
                icon={Warehouse}
                title="Capacity Utilization"
                value={overallCapacity.utilization === null ? 'No Data' : `${overallCapacity.utilization}%`}
                tone="info"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-stretch">
              <div className="surface-card bg-white shadow-xl hover:shadow-2xl rounded-2xl p-6 transition lg:col-span-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Orders Trend</h2>
                </div>
                <p className="text-sm text-slate-500 mt-1">Order volume by date</p>
                <OrdersTrendChart data={ordersTrend} />
              </div>

              <div className="surface-card bg-white shadow-xl hover:shadow-2xl rounded-2xl p-6 transition">
                <div className="flex items-center justify-between gap-4">
                  <select
                    value={selectedCapacityWarehouse}
                    onChange={(e) => setSelectedCapacityWarehouse(e.target.value)}
                    className="form-input border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  >
                    {capacityWarehouseOptions.map((wh) => (
                      <option key={wh} value={wh}>{wh}</option>
                    ))}
                  </select>
                  {loadingCapacity && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader className="animate-spin" size={14} /> Refreshing
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <Warehouse className="h-5 w-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold text-slate-900">Warehouse Capacity Utilization</h2>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedCapacityWarehouse === 'All Warehouses'
                      ? 'Overall used vs remaining'
                      : `${selectedCapacityWarehouse} used vs remaining`}
                  </p>
                </div>
                {capacityError ? (
                  <p className="mt-4 text-sm text-rose-600">{capacityError}</p>
                ) : (
                  <WarehouseCapacityDonut
                    key={selectedCapacityWarehouse}
                    data={filteredCapacity}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 mb-8 items-stretch">
              <div className="surface-card bg-white shadow-xl hover:shadow-2xl rounded-2xl p-4 transition h-full">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <select
                    value={selectedCategoryWarehouse}
                    onChange={(e) => setSelectedCategoryWarehouse(e.target.value)}
                    className="form-input border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  >
                    {capacityWarehouseOptions.map((wh) => (
                      <option key={wh} value={wh}>{wh}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-pink-500" />
                    <h2 className="text-lg font-semibold text-slate-900">Category Capacity Distribution</h2>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">Used vs limits by category</p>
                </div>
                <CategoryCapacityChart
                  key={selectedCategoryWarehouse}
                  data={categoryCapacity}
                />
              </div>

              <div className="surface-card bg-white shadow-xl hover:shadow-2xl rounded-2xl p-6 transition h-full">
                <div className="flex items-center justify-between gap-3 flex-wrap">
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
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-5 w-5 text-amber-500" />
                    <h2 className="text-lg font-semibold text-slate-900">Inventory Threshold Analysis</h2>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">Lowest stock vs thresholds</p>
                </div>
                {loadingThresholds ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-4">
                    <Loader className="animate-spin" size={18} /> Loading thresholds...
                  </div>
                ) : thresholdError ? (
                  <p className="mt-4 text-sm text-rose-600">{thresholdError}</p>
                ) : (
                  <ThresholdChart
                    products={lowestStockProducts}
                    loadingStock={loadingStock}
                    stockError={stockError}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 items-stretch">
              <div className="surface-card bg-white shadow-xl hover:shadow-2xl rounded-2xl p-6 transition">
                <h2 className="text-lg font-semibold text-slate-900">Top Selling Products</h2>
                <TopProductsList products={topProducts} />
              </div>

              <div className="surface-card bg-white shadow-xl hover:shadow-2xl rounded-2xl p-6 transition">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
                </div>
                <p className="text-sm text-slate-500 mt-1">Latest orders</p>
                <RecentOrdersTable orders={filteredOrders} />
              </div>
            </div>

          </>
        )}
      </div>
    </PageContainer>
  );
};

const toneClasses = {
  info: 'from-indigo-500 via-purple-500 to-fuchsia-500 text-white',
  success: 'from-emerald-500 via-teal-500 to-sky-500 text-white',
  warning: 'from-amber-500 via-orange-500 to-rose-500 text-white',
  danger: 'from-rose-500 via-pink-500 to-fuchsia-600 text-white',
};


const StatCard = ({ icon: Icon, title, value, badge, tone = 'info', domId, onClick }) => {
  const clickable = Boolean(onClick);
  const handleKeyDown = (event) => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`relative overflow-hidden rounded-2xl bg-white shadow-xl p-5 flex flex-col gap-3 ${
        clickable
          ? 'cursor-pointer transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-indigo-200'
          : ''
      }`}
    >
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
        {value ?? '-'}
      </p>
    </div>
  );
};

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
  const [rangeDays, setRangeDays] = useState(7);
  const parsed = useMemo(
    () =>
      (data || [])
        .map((d) => {
          const date = parseLocalDateKey(d.label) || new Date(d.label);
          return Number.isNaN(date.getTime()) ? null : { ...d, date };
        })
        .filter(Boolean),
    [data],
  );

  const filtered = useMemo(() => {
    if (!parsed.length) return [];
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (rangeDays - 1));
    return parsed.filter((d) => d.date >= start && d.date <= end);
  }, [parsed, rangeDays]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const summary = useMemo(() => {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    let todayOrders = 0;
    let weekOrders = 0;
    let monthOrders = 0;

    parsed.forEach((d) => {
      const day = new Date(d.date);
      day.setHours(0, 0, 0, 0);
      if (day.getTime() === today.getTime()) todayOrders += d.value;
      if (day >= weekStart && day <= today) weekOrders += d.value;
      if (day >= monthStart && day <= today) monthOrders += d.value;
    });

    return { todayOrders, weekOrders, monthOrders };
  }, [parsed, today]);

  if (!filtered.length) {
    return (
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
        <h4 className="text-sm font-semibold text-slate-800 mb-2">Orders Trend</h4>
        <p className="text-sm text-slate-600">No Data</p>
      </div>
    );
  }

  const width = 820;
  const height = 320;
  const padding = { top: 20, right: 24, bottom: 44, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

  const maxVal = Math.max(...filtered.map((d) => d.value), 1);
  const niceCeil = (value) => {
    if (value <= 5) return 5;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const scaled = Math.ceil(value / magnitude);
    const snap = scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
    return snap * magnitude;
  };
  const yMax = niceCeil(maxVal);
  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);

  const coords = filtered.map((d, idx) => {
    const x =
      padding.left +
      (filtered.length === 1 ? innerWidth / 2 : (idx / (filtered.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - (d.value / yMax) * innerHeight;
    return { ...d, x, y, labelText: formatter.format(d.date) };
  });

  const buildSmoothPath = (points) => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + (curr.x - prev.x) / 2;
      const cpy1 = prev.y;
      const cpx2 = cpx1;
      const cpy2 = curr.y;
      d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const firstPoint = coords[0];
  const lastPoint = coords[coords.length - 1];
  const linePath = coords.length === 1 ? `M ${firstPoint.x} ${firstPoint.y}` : buildSmoothPath(coords);
  const areaPath =
    coords.length === 1
      ? `M ${firstPoint.x} ${height - padding.bottom} L ${firstPoint.x} ${firstPoint.y} Z`
      : `${linePath} L ${lastPoint.x} ${height - padding.bottom} L ${firstPoint.x} ${
          height - padding.bottom
        } Z`;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-end">
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          className="border border-slate-200 text-sm rounded-full px-4 py-2 bg-white shadow-sm hover:border-indigo-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          aria-label="Select orders trend range"
        >
          {[7, 14, 30, 90].map((days) => (
            <option key={days} value={days}>{`Last ${days} Days`}</option>
          ))}
        </select>
      </div>

      <div className="relative overflow-x-auto rounded-2xl bg-gradient-to-b from-white to-slate-50 border border-slate-100 p-4 shadow-inner">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[360px]" role="img">
          <defs>
            <linearGradient id="ordersLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Y grid + axis */}
          {yTicks.map((tick) => {
            const y = padding.top + innerHeight - (tick / yMax) * innerHeight;
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-xs"
                >
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}

          {/* X axis line */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={height - padding.bottom}
            y2={height - padding.bottom}
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {/* Area fill + smooth line */}
          <path d={areaPath} fill="url(#ordersFill)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#ordersLine)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Points + labels */}
          {coords.map((pt) => (
            <g key={pt.label}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="#1d4ed8" stroke="white" strokeWidth="2" />
              <text
                x={pt.x}
                y={pt.y - 12}
                textAnchor="middle"
                className="fill-slate-700 text-sm font-semibold"
              >
                {pt.value}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {coords.map((pt) => (
            <text
              key={`${pt.label}-x`}
              x={pt.x}
              y={height - padding.bottom + 24}
              textAnchor="middle"
              className="fill-slate-500 text-xs"
            >
              {pt.labelText}
            </text>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <CalendarClock size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Today Orders</p>
            <p className="text-xl font-semibold text-slate-900">{summary.todayOrders}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <CalendarDays size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">This Week</p>
            <p className="text-xl font-semibold text-slate-900">{summary.weekOrders}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <CalendarRange size={18} />
          </span>
          <div>
            <p className="text-xs text-slate-500">This Month</p>
            <p className="text-xl font-semibold text-slate-900">{summary.monthOrders}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const RevenueTrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No Data</p>;
  }
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const compact = data.length > 10 ? data.slice(-10) : data;
  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 h-44">
        {compact.map((d) => {
          const heightPct = Math.max(4, (d.value / maxVal) * 100);
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full h-36 rounded-lg bg-slate-100 overflow-hidden flex items-end">
                <div
                  className="w-full rounded-lg bg-gradient-to-t from-indigo-600 via-purple-500 to-pink-400 shadow-[0_10px_20px_rgba(99,102,241,0.25)]"
                  style={{ height: `${heightPct}%` }}
                  title={`${d.label}: ${d.value.toFixed(0)}`}
                />
              </div>
              <span className="text-[10px] text-slate-500">{d.label.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Peak revenue {Math.round(maxVal).toLocaleString()}
      </div>
    </div>
  );
};

const WarehouseCapacityDonut = ({ data }) => {
  if (!data || !data.max) {
    return <p className="mt-6 text-sm text-slate-500">No Data</p>;
  }
  const usedPct = Math.max(0, Math.min(100, data.utilization ?? 0));
  const remainingPct = Math.max(0, 100 - usedPct);
  const gradient = `conic-gradient(#6366f1 0% ${usedPct}%, #e2e8f0 ${usedPct}% 100%)`;
  return (
    <div className="mt-6 flex flex-col items-center">
      <div className="relative h-44 w-44 rounded-full shadow-inner" style={{ background: gradient }}>
        <div className="absolute inset-6 rounded-full bg-white flex flex-col items-center justify-center border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500">Utilization</p>
          <p className="text-2xl font-bold text-slate-900">{usedPct}%</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Used {data.used}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Free {data.remaining}
        </span>
        <span className="text-slate-400">Capacity {data.max}</span>
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
    return <p className="mt-6 text-sm text-slate-500">No Data</p>;
  }
  const maxVal = Math.max(...products.map((p) => p.total), 1);
  return (
    <div className="mt-4 space-y-3">
      {products.map((product, idx) => (
        <div
          key={product.name + idx}
          className="flex items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3 bg-white/90 hover:shadow-md transition"
        >
          <span className="text-sm font-bold text-indigo-600 w-6 text-center">#{idx + 1}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">{product.name}</p>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-indigo-600 via-blue-500 to-sky-400 shadow-[0_6px_14px_rgba(59,130,246,0.35)]"
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

const ThresholdChart = ({ products, loadingStock, stockError }) => {
  if (!products || products.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No Data</p>;
  }

  const getTone = (current, min, max) => {
    if (!Number.isFinite(current)) {
      return { bar: 'bg-slate-300', chip: 'bg-slate-100 text-slate-700', label: 'No Data' };
    }
    if (current < min) {
      return {
        bar: 'bg-rose-500',
        chip: 'bg-rose-100 text-rose-700',
        label: 'Below Min',
      };
    }
    const nearBand = min + Math.max((max - min) * 0.15, min * 0.15);
    if (current <= nearBand) {
      return { bar: 'bg-amber-400', chip: 'bg-amber-100 text-amber-700', label: 'Near Min' };
    }
    return { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', label: 'Healthy' };
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-slate-500">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 text-rose-700 px-3 py-1 border border-rose-100">
            <span className="h-3 w-3 rounded-full bg-rose-500" /> Below Min
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 text-amber-700 px-3 py-1 border border-amber-100">
            <span className="h-3 w-3 rounded-full bg-amber-400" /> Near Min
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 border border-emerald-100">
            <span className="h-3 w-3 rounded-full bg-emerald-500" /> Healthy
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 text-amber-700 px-3 py-1 border border-amber-100">
            <span className="h-3 w-3 rounded-full bg-amber-400" /> Near Min
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 text-rose-700 px-3 py-1 border border-rose-100">
            <span className="h-3 w-3 rounded-full bg-rose-500" /> Below Min
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {loadingStock && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Loader className="animate-spin" size={14} /> Live stock
            </span>
          )}
          {stockError ? (
            <span className="text-amber-600 font-semibold">{stockError}</span>
          ) : (
            <span>Lowest 5 products</span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {products.map((p) => {
          const maxVal = Number(p.max_qty) || 0;
          const minVal = Number(p.min_qty) || 0;
          const currentVal = Number.isFinite(Number(p.current_qty)) ? Number(p.current_qty) : null;
          const trackMax = Math.max(maxVal, currentVal || 0, minVal, 1);
          const minPct = Math.min(100, (minVal / trackMax) * 100);
          const curPct = Math.min(100, ((currentVal ?? 0) / trackMax) * 100);
          const tone = getTone(currentVal, minVal, maxVal);

          return (
            <div
              key={`${p.sku}-${p.warehouse_code}`}
              className="rounded-xl border border-slate-100 bg-white/80 px-3 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{p.sku}</p>
              </div>
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold ${tone.chip}`}>
                {tone.label}
              </span>
            </div>
            <div className="mt-2">
              <div className="relative h-4 rounded-full bg-slate-100 overflow-hidden">
                <div className="absolute inset-y-0 left-0" style={{ width: `${curPct}%` }}>
                  <div className={`h-full ${tone.bar} transition-all duration-300`} />
                </div>
                <div
                  className="absolute inset-y-0 w-0.5 bg-amber-400"
                  style={{ left: `${minPct}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-slate-500">On-hand: {currentVal ?? 'No Data'}</div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
const WarehouseUtilizationChart = ({ data }) => {
  if (!data || data.length === 0) return <p className="mt-6 text-sm text-slate-500">No capacity data.</p>;
  return (
    <div className="mt-5 space-y-4">
      {data.map((wh) => {
        // derive utilization directly from the API payload per warehouse
        const rawUsedPct = wh.max ? (wh.used / wh.max) * 100 : 0;
        const rawRemainingPct = wh.max ? (wh.remaining / wh.max) * 100 : 0;
        const barUsed = Math.max(0, Math.min(100, rawUsedPct));
        // keep the bar widths aligned to each warehouse's capacity (used + remaining ≈ 100%)
        const barRemaining = Math.max(0, Math.min(100 - barUsed, rawRemainingPct));
        const usedPct = Math.round(barUsed);
        const remainingPct = Math.round(barRemaining);
        return (
          <div
            key={wh.code}
            className="group rounded-xl border border-slate-100 bg-white/90 px-4 py-3 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold">
                  {wh.code}
                </span>
                <div className="text-xs text-slate-500">{wh.name || 'Warehouse'}</div>
              </div>
              <div className="text-xs text-slate-500">Capacity: {wh.max}</div>
            </div>

            <div className="mt-3 h-4 rounded-full bg-slate-100 overflow-hidden relative">
              <div
                className="h-full rounded-l-full bg-gradient-to-r from-indigo-600 via-blue-500 to-sky-400 shadow-[0_8px_18px_rgba(59,130,246,0.25)]"
                style={{ width: `${barUsed}%` }}
                title={`Used: ${wh.used}`}
              />
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-r-full"
                style={{ width: `${barRemaining}%` }}
                title={`Remaining: ${wh.remaining}`}
              />
              <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-semibold text-white drop-shadow-sm">
                <span>{usedPct}% used</span>
                <span>{remainingPct}% free</span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Used: {wh.used}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Remaining: {wh.remaining}</span>
              <span className="inline-flex items-center gap-1 text-slate-500/80">Utilization {usedPct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CategoryCapacityChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="mt-6 text-sm text-slate-500">No Data</p>;
  }
  // if none of the categories have any limit configured we treat it as empty
  if (data.every((c) => !c.limit || Number(c.limit) === 0)) {
    return <p className="mt-6 text-sm text-slate-500">No Data</p>;
  }
  const totalUsed = data.reduce((sum, c) => sum + Number(c.used || 0), 0);
  const colors = ['#4f46e5', '#22c55e', '#f59e0b', '#0ea5e9', '#ec4899', '#a855f7'];
  const segments = data.map((cat, idx) => ({
    ...cat,
    color: colors[idx % colors.length],
    share: totalUsed ? (Number(cat.used || 0) / totalUsed) * 100 : 0,
  }));
  const gradientString = segments
    .reduce((acc, seg, idx) => {
      const start = segments.slice(0, idx).reduce((s, x) => s + x.share, 0);
      const end = start + seg.share;
      return acc.concat(`${seg.color} ${start}% ${end}%`);
    }, [])
    .join(', ');
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      <div className="relative mx-auto">
        <div
          className="h-40 w-40 rounded-full shadow-inner"
          style={{
            background: `conic-gradient(${gradientString || '#e2e8f0 0% 100%'})`,
          }}
        />
        <div className="absolute inset-7 rounded-full bg-white flex flex-col items-center justify-center border border-slate-100 shadow-sm">
          <p className="text-[11px] text-slate-500">Total Used</p>
          <p className="text-lg font-bold text-slate-900">{totalUsed}</p>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((cat) => {
          const utilization = cat.limit ? Math.round((cat.used / cat.limit) * 100) : 0;
          return (
            <div
              key={cat.category}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/90 px-3 py-2 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: cat.color }} />
                <div>
                  <p className="text-sm font-semibold text-slate-900 capitalize">{cat.category}</p>
                  <p className="text-[11px] text-slate-500">Limit {cat.limit} · Used {cat.used}</p>
                </div>
              </div>
              <div className="w-28 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${cat.limit ? (cat.used / cat.limit) * 100 : 0}%`,
                    background: cat.color,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-700">{utilization}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OrderStatusChips = ({ distribution }) => {
  if (!distribution || distribution.length === 0) return null;
  const toneMap = {
    pending: 'bg-amber-100 text-amber-700',
    processed: 'bg-blue-100 text-blue-700',
    shipped: 'bg-sky-100 text-sky-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
  };
  const sorted = [...distribution].sort((a, b) => b.value - a.value);
  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((s) => (
        <span
          key={s.status}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${toneMap[s.status] || 'bg-slate-100 text-slate-700'}`}
        >
          <span className="h-2 w-2 rounded-full bg-current opacity-70" />
          <span className="capitalize">{s.status.replace('_', ' ')}</span>
          <span className="text-[11px] opacity-80">{s.value}</span>
        </span>
      ))}
    </div>
  );
};

const RecentOrdersTable = ({ orders }) => {
  if (!orders || orders.length === 0) return <p className="text-sm text-slate-500 mt-4">No Data</p>;
  const rows = orders;
  const resolveCustomerName = (order) =>
    order?.customer_name ||
    order?.customerName ||
    order?.customer?.name ||
    order?.profile?.name ||
    null;
  const resolveProductLabel = (order) => {
    const items = normalizeItems(order);
    const first = items[0];
    return (
      first?.name ||
      first?.product_name ||
      first?.sku ||
      order?.product_name ||
      order?.sku ||
      null
    );
  };
  const resolveAmount = (order) => {
    const amount = Number(
      order?.total_amount ??
        order?.amount ??
        order?.total ??
        order?.total_price ??
        order?.price
    );
    return Number.isNaN(amount) ? null : amount;
  };
  const resolvePaymentMethod = (order) => {
    const raw = String(order?.payment_method || order?.paymentMethod || '').toLowerCase();
    if (raw.includes('stripe')) return 'Stripe';
    if (raw.includes('cash') || raw.includes('cod')) return 'COD';
    if (raw.includes('eth') || raw.includes('matic') || raw.includes('crypto')) return 'Crypto';
    if (order?.stripe_session_id || order?.stripe_payment_id) return 'Stripe';
    return null;
  };
  return (
    <div className="mt-3 border border-slate-100 rounded-xl shadow-sm">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Order ID</th>
            <th className="px-3 py-2 text-left">Product</th>
            <th className="px-3 py-2 text-left">Payment Method</th>
            <th className="px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((o, idx) => {
            const orderId = o?.order_id || o?.orderId || o?.id || `#${idx + 1}`;
            const status = String(o?.status || o?.order_status || 'pending').toLowerCase();
            const productLabel = resolveProductLabel(o);
            const paymentMethod = resolvePaymentMethod(o);
            return (
              <tr key={orderId} className="hover:bg-slate-50/70">
                <td className="px-3 py-2 font-semibold text-slate-900 truncate">{orderId}</td>
                <td className="px-3 py-2 text-slate-700">
                  {productLabel || 'No Data'}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {paymentMethod || 'No Data'}
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={status} tone="order" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};

const ThresholdAlerts = ({ thresholds }) => {
  if (!thresholds || thresholds.length === 0) return <p className="text-sm text-slate-500 mt-4">No threshold data.</p>;
  const bands = thresholds
    .map((t) => ({
      sku: t.sku || 'SKU',
      warehouse: cleanWarehouseCode(t.warehouse_code) || 'N/A',
      min: Number(t.min_qty) || 0,
      max: Number(t.max_qty) || 0,
      gap: Math.max(0, (Number(t.max_qty) || 0) - (Number(t.min_qty) || 0)),
    }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 6);
  return (
    <div className="mt-3 space-y-2">
      {bands.map((b) => (
        <div
          key={`${b.sku}-${b.warehouse}`}
          className="flex items-center justify-between rounded-lg border border-slate-100 bg-white/90 px-3 py-2 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">{b.sku}</p>
            <p className="text-[11px] text-slate-500">WH: {b.warehouse}</p>
          </div>
          <div className="text-right text-[11px] text-slate-600">
            <p>Min {b.min}</p>
            <p>Max {b.max}</p>
            <p className="font-semibold text-indigo-600">Band {b.gap}</p>
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


