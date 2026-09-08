import { useEffect, useState } from 'react';
import { Loader, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trackingService } from '../../services/trackingService.js';
import { getAllAdminOrders } from '../../services/orderService.js';
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

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const STATUS_STEPS = ['in_warehouse', 'in_transit', 'delivered'];

const formatStatus = (status) => {
  if (status === 'in_warehouse') return 'In Warehouse';
  if (status === 'in_transit') return 'In Transit';
  if (status === 'delivered') return 'Delivered';
  return 'Processing';
};

const getStepNumber = (status) => {
  if (status === 'in_warehouse') return 0;
  if (status === 'in_transit') return 1;
  if (status === 'delivered') return 2;
  return 0;
};

const statusBadge = (status) => {
  if (status === 'delivered') return 'bg-green-100 text-green-700';
  if (status === 'in_transit') return 'bg-yellow-100 text-yellow-700';
  if (status === 'in_warehouse') return 'bg-slate-100 text-slate-700';
  return 'bg-slate-100 text-slate-700';
};

export default function Tracking() {
  const navigate = useNavigate();
  const [shipmentId, setShipmentId] = useState('');
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [delivering, setDelivering] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  useEffect(() => {
    try {
      const storedShipmentId = localStorage.getItem('latest_shipment_id');
      if (storedShipmentId) {
        setShipmentId(storedShipmentId);
      }
    } catch (storageError) {
      console.warn('Unable to read stored shipment id', storageError);
    }
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        setOrdersError('');
        const response = await getAllAdminOrders();
        const list = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : [];
        setOrders(list);
      } catch (err) {
        console.warn('Unable to load orders for tracking context', err);
        setOrdersError(err?.message || 'Unable to load orders');
      } finally {
        setOrdersLoaded(true);
      }
    };
    loadOrders();
  }, []);

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!shipmentId.trim()) {
      setError('Search shipment to see tracking data');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const data = await trackingService.getTrackingByShipmentId(shipmentId.trim());
      setTrackingData(data);
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 404) {
        setError('Shipment not found');
      } else if (err?.status === 403) {
        setError('Admin access required');
      } else {
        setError(err.message || 'Unable to load shipment');
      }
      setTrackingData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async () => {
    if (!trackingData?.shipment_id) {
      setError('No shipment ID available');
      return;
    }

    try {
      setDelivering(true);
      setError('');
      setDeliveryMessage('');
      const response = await trackingService.markDelivered(trackingData.shipment_id);
      setDeliveryMessage(`Shipment ${response.shipment_id} marked as delivered`);
      // Update tracking data to reflect the new status
      setTrackingData({
        ...trackingData,
        status: response.status,
      });
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setError('Admin access required to mark as delivered');
      } else if (err?.status === 404) {
        setError('Shipment not found');
      } else {
        setError(err.message || 'Failed to mark shipment as delivered');
      }
      setTrackingData(null);
    } finally {
      setDelivering(false);
    }
  };

  const rawStatus = trackingData
    ? String(getValue(trackingData, ['status', 'shipment_status', 'state'], '')).toLowerCase()
    : '';
  const normalizedStatus = STATUS_STEPS.includes(rawStatus) ? rawStatus : 'in_warehouse';
  const currentStep = getStepNumber(normalizedStatus);

  // Find matching order by shipment id using already-fetched orders list
  const matchedOrder = (() => {
    if (!trackingData || !orders || orders.length === 0) return null;
    const targetShipment = getValue(trackingData, ['shipment_id', 'shipmentId'], '').toString();
    if (!targetShipment) return null;
    return orders.find((order) => {
      const orderShipment = getValue(order, ['shipment_id', 'shipmentId', 'shipment'], '').toString();
      return orderShipment && orderShipment === targetShipment;
    }) || null;
  })();

  const orderIdFromOrder =
    matchedOrder?.order_id ||
    matchedOrder?.orderId ||
    matchedOrder?.id ||
    null;

  const warehouseFromOrder =
    getValue(matchedOrder || {}, ['allocated_warehouse', 'warehouse_code', 'warehouse', 'warehouse_id', 'warehouseId'], '') || null;

  const productFromOrder = (() => {
    if (!matchedOrder) return null;
    if (Array.isArray(matchedOrder.items) && matchedOrder.items.length > 0) {
      const labels = matchedOrder.items
        .map((i) => i?.sku || i?.product_name || i?.name)
        .filter(Boolean);
      if (labels.length) return labels.join(', ');
    }
    return matchedOrder.sku || matchedOrder.product || matchedOrder.product_name || null;
  })();

  const orderDateFromOrder = (() => {
    if (!matchedOrder) return '';
    return formatDate(
      getValue(
        matchedOrder,
        ['order_date', 'orderDate', 'ordered_at', 'orderedAt', 'created_at', 'createdAt', 'timestamp'],
        ''
      )
    );
  })();

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container max-w-5xl mx-auto">
        <div className="page-header mb-8">
          <h1 className="page-title text-3xl font-bold text-slate-900">Tracking</h1>
          <p className="page-subtitle text-slate-500 mt-2">
            Search shipment details with a Shipment ID; results are read-only and come from the existing tracking API.
          </p>
        </div>

        <div className="surface-card bg-white shadow-xl rounded-xl p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-slate-400" size={20} />
              <input
                type="text"
                value={shipmentId}
                onChange={(event) => setShipmentId(event.target.value)}
                placeholder="Enter shipment ID..."
                className="form-input w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500">Enter shipment ID to track shipment.</p>
            </div>
            <button
              type="submit"
              className="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition inline-flex items-center justify-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader className="animate-spin mr-2" size={16} />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </form>
        </div>

        <div className="surface-card bg-white shadow-xl rounded-xl p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="animate-spin text-blue-500" size={36} />
            </div>
          ) : error ? (
            <div className="text-center text-red-600 font-semibold">{error}</div>
          ) : !trackingData ? (
            <div className="text-center text-slate-500">Enter a Shipment ID to track shipment.</div>
          ) : (
            <div className="space-y-6">
              {deliveryMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                  {deliveryMessage}
                </div>
              )}
              {/* Shipment summary */}
              <div className="rounded-2xl border border-slate-100 shadow-sm bg-white p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs uppercase text-slate-400">Shipment Summary</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {getValue(trackingData, ['shipment_id', 'shipmentId'], '—')}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(
                      normalizedStatus
                    )}`}
                  >
                    {formatStatus(normalizedStatus)}
                  </span>
                </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      {
                        label: 'Order ID',
                      value:
                        orderIdFromOrder ||
                        trackingData?.order_id ||
                        trackingData?.orderId ||
                        trackingData?.order?.order_id ||
                        trackingData?.order?.id ||
                        trackingData?.orders?.[0]?.order_id ||
                        trackingData?.orders?.[0]?.id ||
                        '—',
                    },
                    {
                      label: 'Warehouse',
                      value:
                        warehouseFromOrder ||
                        getValue(
                          trackingData,
                          ['allocated_warehouse', 'warehouse_code', 'warehouse', 'warehouse_id', 'warehouseId'],
                          '—'
                        ) ||
                        '—',
                    },
                    {
                      label: 'Product / SKU',
                      value:
                        productFromOrder ||
                        (Array.isArray(trackingData?.items) && trackingData.items.length > 0
                          ? trackingData.items
                              .map((i) => i?.sku || i?.product_name || i?.name)
                              .filter(Boolean)
                              .join(', ')
                          : trackingData?.sku || trackingData?.product || trackingData?.product_name) || '—',
                    },
                    {
                      label: 'Order Date',
                      value:
                        orderDateFromOrder ||
                        formatDate(
                          getValue(
                            trackingData,
                            ['order_date', 'orderDate', 'ordered_at', 'orderedAt', 'created_at', 'createdAt', 'timestamp'],
                            ''
                          )
                        ) ||
                        '—',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase text-slate-400">{item.label}</p>
                      <p className="text-sm font-semibold text-slate-900 mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Items table (only if present) */}
              {Array.isArray(trackingData?.items) && trackingData.items.length > 0 && (
                <div className="rounded-2xl border border-slate-100 shadow-sm bg-white">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800">Shipment Items</h3>
                    <span className="text-xs text-slate-500">{trackingData.items.length} item(s)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2">SKU / Product</th>
                          <th className="px-4 py-2">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trackingData.items.map((item, idx) => (
                          <tr key={`${item?.sku || idx}-${idx}`} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-900 font-medium">
                              {item?.name || item?.product_name || item?.sku || '—'}
                            </td>
                            <td className="px-4 py-2 text-slate-700">{item?.quantity ?? item?.qty ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status progress */}
              <div className="rounded-2xl border border-slate-100 shadow-sm bg-white p-5 space-y-4 text-center">
                <div className="flex items-center justify-center gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">Shipment Progress</h3>
                  {normalizedStatus !== 'delivered' && (
                    <button
                      type="button"
                      onClick={handleMarkDelivered}
                      disabled={delivering}
                      className="btn btn-success px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {delivering ? 'Marking...' : 'Mark as Delivered'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {STATUS_STEPS.map((step, index) => {
                    const state =
                      index < currentStep
                        ? 'completed'
                        : index === currentStep
                          ? 'active'
                          : 'pending';
                    return (
                      <div
                        key={step}
                        className={`rounded-lg border px-4 py-3 ${
                          state === 'completed'
                            ? 'border-green-200 bg-green-50'
                            : state === 'active'
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-slate-200 bg-white'
                        }`}
                      >
                        <p
                          className={`text-sm font-semibold ${
                            state === 'completed'
                              ? 'text-green-700'
                              : state === 'active'
                                ? 'text-blue-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {formatStatus(step)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {state === 'completed'
                            ? 'Completed'
                            : state === 'active'
                              ? 'Active'
                              : 'Pending'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
