import { useCallback, useEffect, useState } from 'react';
import { Loader, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { orderService, getAllOrders } from '../../services/orderService.js';
import { subscribeOrderUpdates } from '../../utils/orderEvents';
import './Orders.css';
import PageContainer from '../../components/common/PageContainer';

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

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toText(value);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateDDMMYYYY = (value) => {
  if (!value) return '-';
  if (typeof value === 'string') {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toText(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const normalizeItems = (order) =>
  Array.isArray(order?.items)
    ? order.items
    : order?.sku
      ? [{ sku: order.sku, quantity: order.quantity }]
      : [];

export default function Orders() {
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [allOrders, setAllOrders] = useState([]);

  const fetchAllOrders = useCallback(async () => {
    try {
      const response = await getAllOrders();
      const list = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response)
          ? response
          : [];
      setAllOrders(list);
    } catch (error) {
      console.error('Failed to fetch orders', error);
      // fallback to cached latestOrders if available
      try {
        const raw = sessionStorage.getItem('latestOrders');
        const cached = raw ? JSON.parse(raw) : [];
        if (Array.isArray(cached) && cached.length) {
          setAllOrders(cached);
        }
      } catch (err) {
        // ignore cache errors
      }
    }
  }, []);

  useEffect(() => {
    fetchAllOrders();
    const unsubscribe = subscribeOrderUpdates(fetchAllOrders);
    return unsubscribe;
  }, [fetchAllOrders]);

  const handleSearchOrder = async (event) => {
    event.preventDefault();
    if (!searchId.trim()) return;
    try {
      setIsLoadingSearch(true);
      setSearchError(null);
      const data = await orderService.getOrderWithProductNames(searchId.trim());
      console.log('Order fetched:', data);
      const raw =
        (Array.isArray(data) ? data[0] : null) ??
        data?.order ??
        data?.data?.order ??
        data?.data ??
        data;
      const normalizedSearch = {
        ...raw,
        items: normalizeItems(raw),
        payment_method:
          raw?.payment_method ??
          raw?.paymentMethod ??
          raw?.payment?.method ??
          raw?.payment?.payment_method ??
          raw?.payment?.paymentMethod ??
          raw?.payment?.type ??
          raw?.payment?.provider,
        created_at:
          raw?.created_at ??
          raw?.createdAt ??
          raw?.created ??
          raw?.ordered_at ??
          raw?.orderedAt ??
          raw?.order_date ??
          raw?.orderDate ??
          raw?.timestamp,
      };
      const fallbackMatch = Array.isArray(allOrders)
        ? allOrders.find(
            (order) =>
              order?.order_id === normalizedSearch?.order_id ||
              order?.orderId === normalizedSearch?.order_id ||
              order?.id === normalizedSearch?.order_id
          )
        : null;
      const mergedSearch = {
        ...normalizedSearch,
        payment_method:
          normalizedSearch?.payment_method ??
          fallbackMatch?.payment_method ??
          fallbackMatch?.paymentMethod,
        created_at:
          normalizedSearch?.created_at ??
          fallbackMatch?.created_at ??
          fallbackMatch?.createdAt ??
          fallbackMatch?.order_date ??
          fallbackMatch?.orderDate,
      };
      setSearchResult(mergedSearch);
      setSearchError('');
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setSearchError('Admin access required');
        return;
      }
      if (err?.status === 404) {
        setSearchError('Order not found');
        return;
      }
      setSearchError(err.message || 'Request failed');
      setSearchResult(null);
    } finally {
      setIsLoadingSearch(false);
    }
  };

  return (
    <>
    <PageContainer className="bg-slate-50">
      <div className="page-container max-w-6xl mx-auto">
        <div className="page-header mb-8">
          <h1 className="page-title text-3xl font-bold text-slate-900">Orders</h1>
          <p className="page-subtitle text-slate-500 mt-2">Track customer orders in real time.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
          <div className="surface-card bg-white shadow-xl rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900">Search Order</h2>
            <p className="text-sm text-slate-500 mt-1">Lookup order details by order ID.</p>

            <form onSubmit={handleSearchOrder} className="mt-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  value={searchId}
                  onChange={(event) => setSearchId(event.target.value)}
                  className="form-input w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg"
                  placeholder="Order ID"
                />
              </div>
              <button
                type="submit"
                disabled={isLoadingSearch}
                className="btn btn-outline border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
              >
                {isLoadingSearch ? 'Searching...' : 'Search'}
              </button>
            </form>

            {isLoadingSearch && (
              <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
                <Loader className="animate-spin" size={16} />
                Loading order...
              </div>
            )}

            {searchError && <p className="mt-6 text-sm text-red-600">{searchError}</p>}

            {searchResult && (
              <div className="surface-subtle mt-6 bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Order ID</span>
                  <span className="text-slate-900 font-semibold">
                    {getValue(searchResult, ['order_id', 'orderId', 'id'])}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-500">Items</span>
                  <div className="mt-2 space-y-1">
                    {(searchResult?.items && Array.isArray(searchResult.items)
                      ? searchResult.items
                      : []).map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-slate-700">
                          {item?.name ?? item?.sku ?? '-'}
                        </span>
                        <span className="text-slate-900 font-medium">
                          Qty: {item?.quantity ?? '-'}
                        </span>
                      </div>
                    ))}
                    {(!searchResult?.items || searchResult.items.length === 0) && (
                      <span className="text-slate-700">
                        {`SKU: ${getValue(searchResult, ['sku', 'SKU'], '-')}, Qty: ${getValue(searchResult, ['quantity', 'qty'], '-')}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <span className="text-slate-900">
                    {getValue(searchResult, ['status', 'order_status'], 'PENDING')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Shipment ID</span>
                  <span className="text-slate-900">
                    {getValue(searchResult, ['shipment_id', 'shipmentId'], '-')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Payment Method</span>
                  <span className="text-slate-900">
                    {getValue(searchResult, ['payment_method', 'paymentMethod'], '-') !== '-'
                      ? getValue(searchResult, ['payment_method', 'paymentMethod'], '-')
                      : getValue(searchResult?.payment || {}, ['method', 'payment_method', 'paymentMethod', 'type', 'provider'], '-')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Payment Status</span>
                  <span className="text-slate-900">
                    {getValue(searchResult, ['payment_status', 'paymentStatus'], 'pending')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Warehouse</span>
                  <span className="text-slate-900">
                    {getValue(searchResult, ['allocated_warehouse', 'warehouse_code'], '-')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Created At</span>
                  <span className="text-slate-900">
                    {formatDateDDMMYYYY(
                      getValue(searchResult, [
                        'created_at',
                        'createdAt',
                        'created',
                        'ordered_at',
                        'orderedAt',
                        'order_date',
                        'orderDate',
                        'timestamp',
                      ]) !== '-'
                        ? getValue(searchResult, [
                            'created_at',
                            'createdAt',
                            'created',
                            'ordered_at',
                            'orderedAt',
                            'order_date',
                            'orderDate',
                            'timestamp',
                          ])
                        : getValue(searchResult?.order || {}, [
                            'created_at',
                            'createdAt',
                            'created',
                            'ordered_at',
                            'orderedAt',
                            'order_date',
                            'orderDate',
                            'timestamp',
                          ])
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="surface-card mt-8 bg-white shadow-xl rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Orders</h2>
              <p className="text-sm text-slate-500 mt-1">Complete list of recently created orders.</p>
            </div>
            <button
              type="button"
              onClick={fetchAllOrders}
              className="btn btn-outline inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {allOrders.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No orders yet.</p>
          ) : (
            <div className="orders-container">
              {allOrders.map((order) => {
                const orderId = getValue(order, ['order_id', 'orderId', 'id'], '-');
                const status = getValue(order, ['status', 'order_status'], 'PENDING');
                const paymentStatus = getValue(order, ['payment_status', 'paymentStatus'], 'pending');
                const shipmentId = getValue(order, ['shipment_id', 'shipmentId'], '-');
                const warehouse = getValue(order, ['allocated_warehouse', 'warehouse_code'], '-');
                const sku = getValue(order, ['sku'], '-');
                const quantity = getValue(order, ['quantity'], '-');

                return (
                  <div key={orderId} className="order-card">
                    <div className="order-header">
                      <div className="order-id">{orderId}</div>
                      <div className={`status-badge ${String(status || '').toLowerCase()}`}>{status}</div>
                    </div>

                    <div className="order-product">
                      {sku} — Qty: {quantity}
                    </div>

                    <div className="order-info">
                      <div>
                        <strong>Shipment:</strong> {shipmentId}
                      </div>
                      <div>
                        <strong>Warehouse:</strong> {warehouse}
                      </div>
                      <div>
                        <strong>Payment:</strong> {paymentStatus}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageContainer>

    </>
  );
}
