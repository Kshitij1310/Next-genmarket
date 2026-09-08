import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  DollarSign,
  FileText,
  Loader,
  RefreshCcw,
  TrendingUp,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { revenueService } from '../../services/revenueService.js';
import PageContainer from '../../components/common/PageContainer';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const warehouseCodeOf = (wh) => wh?.warehouse_code || wh?.code || wh?.id || null;

const RevenueDetails = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [revenueRows, setRevenueRows] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [orders, setOrders] = useState([]);

  const totals = useMemo(() => {
    return revenueRows.reduce(
      (acc, row) => ({
        total: acc.total + Number(row?.total_revenue_usd || 0),
        stripe: acc.stripe + Number(row?.stripe_revenue_usd || 0),
        cod: acc.cod + Number(row?.cod_revenue_usd || 0),
        eligible: acc.eligible + Number(row?.revenue_eligible_orders_count || 0),
        delivered: acc.delivered + Number(row?.delivered_orders_count || 0),
      }),
      { total: 0, stripe: 0, cod: 0, eligible: 0, delivered: 0 },
    );
  }, [revenueRows]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const whList = await revenueService.getWarehouses();
      setWarehouses(whList);
      const revenue = await revenueService.getRevenueForWarehouses(whList);
      setRevenueRows(revenue);
      // Default to "all" so users see combined view first.
      setSelectedWarehouse('all');
    } catch (err) {
      setError(err.message || 'Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(
    async (warehouseCode) => {
      if (!warehouseCode) return;
      setOrdersLoading(true);
      try {
        if (warehouseCode === 'all') {
          const allOrders = await Promise.all(
            warehouses.map(async (wh) => {
              const code = warehouseCodeOf(wh);
              if (!code) return [];
              try {
                const res = await revenueService.getOrdersForRevenue(code);
                const list = Array.isArray(res?.orders) ? res.orders : [];
                return list.map((order) => ({
                  ...order,
                  warehouse_code: order.warehouse_code || code,
                }));
              } catch (innerErr) {
                // Skip warehouse on failure but keep rest.
                return [];
              }
            }),
          );
          setOrders(allOrders.flat());
        } else {
          const res = await revenueService.getOrdersForRevenue(warehouseCode);
          setOrders(Array.isArray(res?.orders) ? res.orders : []);
        }
      } catch (err) {
        setError(err.message || 'Failed to load revenue orders');
      } finally {
        setOrdersLoading(false);
      }
    },
    [warehouses],
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!warehouses.length && selectedWarehouse === 'all') return;
    loadOrders(selectedWarehouse);
  }, [selectedWarehouse, warehouses, loadOrders]);

  const warehouseOptions = useMemo(() => {
    const items = warehouses.map((wh) => ({
      label: warehouseCodeOf(wh) || 'Unknown',
      value: warehouseCodeOf(wh) || 'unknown',
    }));
    return [{ label: 'All Warehouses', value: 'all' }, ...items];
  }, [warehouses]);

  return (
    <PageContainer className="bg-gradient-to-br from-white via-slate-50 to-indigo-50">
      <div className="page-container max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Analytics</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl font-bold text-slate-900">Revenue Details</h1>
            </div>
            <p className="text-sm text-slate-600 mt-1">Breakdown by warehouse and order.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSummary}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <RefreshCcw size={16} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader className="animate-spin h-6 w-6 mr-2" />
            Loading revenue data...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                icon={DollarSign}
                title="Total Revenue"
                value={formatCurrency(totals.total)}
                accent="indigo"
              />
              <SummaryCard
                icon={DollarSign}
                title="Stripe Revenue"
                value={formatCurrency(totals.stripe)}
                accent="blue"
              />
              <SummaryCard
                icon={DollarSign}
                title="COD Revenue"
                value={formatCurrency(totals.cod)}
                accent="amber"
              />
            </div>

            <section className="surface-card bg-white border border-slate-100 shadow-xl rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <WarehouseIcon className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Revenue by Warehouse</h2>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2 pr-4">Warehouse</th>
                      <th className="py-2 pr-4">Delivered Orders</th>
                      <th className="py-2 pr-4">Eligible Orders</th>
                      <th className="py-2 pr-4">Stripe</th>
                      <th className="py-2 pr-4">COD</th>
                      <th className="py-2 pr-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueRows.map((row) => (
                      <tr key={row.warehouse_code} className="border-t border-slate-100 text-slate-800">
                        <td className="py-3 pr-4 font-semibold">{row.warehouse_code}</td>
                        <td className="py-3 pr-4">{row.delivered_orders_count ?? '—'}</td>
                        <td className="py-3 pr-4">{row.revenue_eligible_orders_count ?? '—'}</td>
                        <td className="py-3 pr-4">{formatCurrency(row.stripe_revenue_usd)}</td>
                        <td className="py-3 pr-4">{formatCurrency(row.cod_revenue_usd)}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-900">
                          {formatCurrency(row.total_revenue_usd)}
                        </td>
                      </tr>
                    ))}
                    {revenueRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-500">
                          No revenue data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="surface-card bg-white border border-slate-100 shadow-xl rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Orders Contributing to Revenue</h2>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="warehouse-filter" className="text-sm text-slate-600">
                    Warehouse
                  </label>
                  <select
                    id="warehouse-filter"
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="form-select rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {warehouseOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader className="animate-spin h-5 w-5 mr-2" />
                  Loading orders...
                </div>
              ) : orders.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No orders found for this selection.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2 pr-4">Order</th>
                        <th className="py-2 pr-4">Warehouse</th>
                        <th className="py-2 pr-4">Payment</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Created / Delivered</th>
                        <th className="py-2 pr-4">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.order_id} className="border-t border-slate-100 text-slate-800">
                          <td className="py-3 pr-4 font-semibold">{order.order_id}</td>
                          <td className="py-3 pr-4">{order.warehouse_code || '—'}</td>
                          <td className="py-3 pr-4 capitalize">{order.payment_method || '—'}</td>
                          <td className="py-3 pr-4 capitalize">{order.payment_status || '—'}</td>
                          <td className="py-3 pr-4 font-semibold text-slate-900">
                            {formatCurrency(order.total_amount_usd)}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="text-slate-800">{formatDateTime(order.created_at)}</div>
                            <div className="text-xs text-slate-500">{formatDateTime(order.delivered_at)}</div>
                          </td>
                          <td className="py-3 pr-4">
                            {order.included_in_revenue ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
                                Counted
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
                                Excluded
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageContainer>
  );
};

const SummaryCard = ({ icon: Icon, title, value, helper, accent = 'indigo' }) => {
  const palette = {
    indigo: 'from-indigo-500 via-sky-500 to-cyan-400',
    blue: 'from-blue-500 via-indigo-500 to-sky-400',
    amber: 'from-amber-500 via-orange-500 to-rose-400',
    emerald: 'from-emerald-500 via-teal-500 to-sky-400',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm p-4">
      <div className={`absolute inset-0 opacity-60 blur-3xl bg-gradient-to-br ${palette[accent]}`} />
      <div className="relative flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 shadow-inner">
          <Icon className="h-5 w-5 text-slate-800" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
          <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
          {helper && <p className="text-[11px] text-slate-600">{helper}</p>}
        </div>
      </div>
    </div>
  );
};

export default RevenueDetails;
