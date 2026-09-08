import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { getAllAdminOrders } from '../../services/orderService.js';
import PageContainer from '../../components/common/PageContainer';

const FILTERS = [
  { key: 'all', label: 'All Orders' },
  { key: 'pending', label: 'Pending Orders' },
  { key: 'delivery', label: 'Delivery Orders' },
  { key: 'cancelled', label: 'Cancelled Orders' },
];

const getValue = (obj, keys, fallback = '—') => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const normalizeStatus = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatCurrency = (amount, currency = 'USD') => {
  if (amount === undefined || amount === null || amount === '') return '—';
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(numericAmount);
  } catch (error) {
    return `${currency || 'USD'} ${numericAmount.toFixed(2)}`;
  }
};

const resolvePaymentMethod = (order) => {
  const raw = getValue(order, ['payment_method', 'paymentMethod'], '');
  const key = String(raw || '').toLowerCase();
  if (key.includes('stripe')) return 'Stripe';
  if (key.includes('crypto')) return 'Crypto';
  if (key.includes('cod') || key.includes('cash')) return 'COD';
  return raw || '—';
};

const resolveCustomerName = (order) =>
  getValue(order, ['customer_name', 'customerName', 'name', 'customer', 'customer_id'], '—');

const resolveOrderDate = (order) =>
  getValue(order, ['created_at', 'createdAt', 'order_date', 'orderDate', 'ordered_at', 'orderedAt'], '—');

const resolveTotalAmount = (order) =>
  getValue(order, ['total_amount', 'totalAmount', 'amount', 'total'], '—');

const resolveShipmentId = (order) =>
  getValue(order, ['shipment_id', 'shipmentId', 'shipment'], '—');

const resolveSkuList = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length > 0) {
    const labels = items
      .map((item) => item?.sku || item?.SKU || item?.name || item?.product_name)
      .filter(Boolean);
    if (labels.length) return labels.join(', ');
  }
  return order?.sku || order?.SKU || '—';
};

const statusBadgeTone = (status) => {
  const normalized = normalizeStatus(status);
  if (normalized.includes('pending')) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-100';
  if (normalized.includes('cancel')) return 'bg-rose-50 text-rose-700 ring-1 ring-rose-100';
  if (normalized.includes('deliver') || normalized.includes('ship'))
    return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100';
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
};

const matchFilter = (order, filterKey) => {
  if (filterKey === 'all') return true;
  const status = normalizeStatus(getValue(order, ['status', 'order_status'], ''));
  if (filterKey === 'pending') return status.includes('pending');
  if (filterKey === 'cancelled') return status.includes('cancel');
  if (filterKey === 'delivery') {
    return (
      status.includes('deliver') ||
      status.includes('shipped') ||
      status.includes('out for delivery')
    );
  }
  return true;
};

const OrderManagement = () => {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const response = await getAllAdminOrders();
      const list = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
          ? response
          : [];
      setOrders(list);
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to fetch orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    // apply preset filter from navigation state or query param
    const statePreset = location.state?.presetFilter;
    const queryPreset = new URLSearchParams(location.search).get('filter');
    const preset = (statePreset || queryPreset || '').toLowerCase();
    if (preset === 'pending') setActiveFilter('pending');
    if (preset === 'delivery') setActiveFilter('delivery');
    if (preset === 'cancelled') setActiveFilter('cancelled');
  }, [fetchOrders]);

  const filterCounts = useMemo(() => {
    const counts = { all: orders.length, pending: 0, delivery: 0, cancelled: 0 };
    orders.forEach((order) => {
      if (matchFilter(order, 'pending')) counts.pending += 1;
      if (matchFilter(order, 'delivery')) counts.delivery += 1;
      if (matchFilter(order, 'cancelled')) counts.cancelled += 1;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const passesFilter = matchFilter(order, activeFilter);
      if (!passesFilter) return false;
      if (!query) return true;
      const id = String(getValue(order, ['order_id', 'orderId', 'id'], '')).toLowerCase();
      const customer = String(resolveCustomerName(order) || '').toLowerCase();
      const shipment = String(resolveShipmentId(order) || '').toLowerCase();
      const skuList = String(resolveSkuList(order) || '').toLowerCase();
      return (
        id.includes(query) ||
        customer.includes(query) ||
        shipment.includes(query) ||
        skuList.includes(query)
      );
    });
  }, [orders, activeFilter, searchTerm]);

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container mx-auto max-w-7xl space-y-6">
        <header className="page-header">
          <p className="text-sm uppercase tracking-wide text-slate-500">Operations</p>
          <h1 className="page-title text-3xl font-semibold text-slate-900">Order Management</h1>
          <p className="page-subtitle mt-1 text-sm text-slate-600">
            Review and manage incoming customer orders.
          </p>
        </header>

        <section className="surface-card rounded-3xl bg-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`btn inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeFilter === filter.key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {filter.label}
                  <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {filterCounts[filter.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-1 justify-end gap-3 min-w-[260px]">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Order ID or Customer"
                className="form-input w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={fetchOrders}
                className="btn btn-outline inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mx-6 mt-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="table-shell overflow-x-auto">
            <table className="market-table min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {[
                    'Order ID',
                    'Shipment ID',
                    'SKU / Product',
                    'Customer Name',
                    'Order Date',
                    'Total Amount',
                    'Payment Method',
                    'Order Status',
                  ].map((column) => (
                    <th key={column} className="px-6 py-3">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                      No orders found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const orderId = getValue(order, ['order_id', 'orderId', 'id'], '—');
                    const status = getValue(order, ['status', 'order_status'], '—');
                    const currency = getValue(order, ['currency'], 'USD');
                    const amount = resolveTotalAmount(order);
                    const shipmentId = resolveShipmentId(order);
                    const skuList = resolveSkuList(order);
                    return (
                      <tr key={orderId} className="border-b border-slate-100 text-sm text-slate-700 hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-slate-900">{orderId}</td>
                        <td className="px-6 py-4 text-slate-700">{shipmentId}</td>
                        <td className="px-6 py-4 text-slate-700">{skuList}</td>
                        <td className="px-6 py-4 text-slate-900">{resolveCustomerName(order)}</td>
                        <td className="px-6 py-4 text-slate-500">{formatDate(resolveOrderDate(order))}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {amount === '—' ? '—' : formatCurrency(amount, currency)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {resolvePaymentMethod(order)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadgeTone(
                              status
                            )}`}
                          >
                            {String(status || '—').replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageContainer>
  );
};

export default OrderManagement;
