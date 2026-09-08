import React from 'react';
import { useState, useEffect } from 'react';
import { Loader, RefreshCw, AlertTriangle, CheckCircle, Clock, Info } from 'lucide-react';
import { reorderService } from '../../services/reorderService';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../../components/common/PageContainer';

const Card = ({ title, children, className = '' }) => (
  <section className={`surface-card bg-white rounded-xl shadow-xl p-6 ${className}`}>
    <header className="mb-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    </header>
    {children}
  </section>
);

const StatCard = ({ label, value }) => (
  <div className="surface-card stat-card bg-white rounded-xl shadow-xl p-6">
    <p className="text-sm text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
  </div>
);

const EmptyTableState = ({ message }) => (
  <div className="py-12 text-center text-sm text-slate-500">{message}</div>
);

const Reorder = () => {
  const navigate = useNavigate();
  const [reorderResult, setReorderResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  // AI orders + alerts
  const [aiOrders, setAiOrders] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loadingAiOrders, setLoadingAiOrders] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Warehouses and Categories
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Stock Health Overview
  const [stockData, setStockData] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [skuSearchInput, setSkuSearchInput] = useState('');

  // Fetch warehouses and categories on component load
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingWarehouses(true);
        setLoadingCategories(true);
        
        const warehousesData = await reorderService.getAllWarehouses();
        setWarehouses(warehousesData);
        setSelectedWarehouse('');
        
        const categoriesData = await reorderService.getAllCategories();
        setCategories(categoriesData);
        setSelectedCategory('');
      } catch (err) {
        console.error('Failed to load warehouses and categories:', err);
      } finally {
        setLoadingWarehouses(false);
        setLoadingCategories(false);
      }
    };

    fetchData();
  }, []);

  // Load AI orders + alerts
  useEffect(() => {
    loadReorderData();
  }, []);

  const loadReorderData = async () => {
    try {
      setFetchError('');
      setLoadingAiOrders(true);
      setLoadingAlerts(true);
      const [ordersData, alertsData] = await Promise.all([
        reorderService.getAiOrders(),
        reorderService.getAlerts(),
      ]);
      setAiOrders(Array.isArray(ordersData) ? ordersData : []);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setLastUpdated(new Date());
    } catch (err) {
      setFetchError(err?.message || 'Failed to load reorder data');
    } finally {
      setLoadingAiOrders(false);
      setLoadingAlerts(false);
    }
  };

  // Fetch stock data when warehouse, category, or SKU changes
  useEffect(() => {
    const fetchStockData = async () => {
      try {
        setLoadingStock(true);
        let data = [];

        if (skuSearchInput.trim()) {
          // SKU search takes precedence
          const result = await reorderService.searchStockBySku(skuSearchInput.trim());
          data = Array.isArray(result) ? result : [];
        } else {
          // Always load the full flattened list, then filter client-side
          const result = await reorderService.getAllStockData();
          data = Array.isArray(result) ? result : [];

          if (selectedWarehouse) {
            data = data.filter((item) => item.warehouse_code === selectedWarehouse);
          }
          if (selectedCategory) {
            data = data.filter((item) => item.category === selectedCategory);
          }
        }

        setStockData(data);
      } catch (err) {
        console.error('Failed to fetch stock data:', err);
        setStockData([]);
      } finally {
        setLoadingStock(false);
      }
    };

    // Debounce the fetch to avoid excessive API calls
    const timer = setTimeout(() => {
      fetchStockData();
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedWarehouse, selectedCategory, skuSearchInput]);

  const handleRunReorder = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');
      const result = await reorderService.runReorder();
      setReorderResult(result);
      setSuccessMessage(`Reorder cycle completed: ${result.orders_created} orders created for ${result.low_stock_count} low stock items`);
      await loadReorderData();
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setError('Admin access required to run reorder cycle');
      } else {
        setError(err.message || 'Failed to run reorder cycle');
      }
      setReorderResult(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending_dealer1' || s === 'pending_dealer2') return { label: 'Pending Dealer', className: 'bg-amber-50 text-amber-700' };
    if (s === 'active') return { label: 'Approved', className: 'bg-emerald-50 text-emerald-700' };
    if (s === 'fulfilled') return { label: 'Fulfilled', className: 'bg-emerald-100 text-emerald-800' };
    if (s === 'waiting_retry') return { label: 'Retry Scheduled', className: 'bg-blue-50 text-blue-700' };
    return { label: status || 'Unknown', className: 'bg-slate-100 text-slate-700' };
  };

  const levelBadge = (level) => {
    const l = String(level || '').toLowerCase();
    if (l === 'error') return { label: 'Error', className: 'bg-rose-50 text-rose-700', icon: AlertTriangle };
    if (l === 'warning') return { label: 'Warning', className: 'bg-amber-50 text-amber-700', icon: Clock };
    return { label: 'Info', className: 'bg-blue-50 text-blue-700', icon: Info };
  };
  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <section className="surface-card bg-white rounded-xl shadow-xl p-6">
          <div className="flex flex-col gap-4">
            <div className="page-header">
              <p className="text-sm uppercase tracking-wide text-slate-500">Operations</p>
              <h1 className="page-title text-3xl font-bold text-slate-900">Supply Reorder Center</h1>
              <p className="page-subtitle mt-2 text-sm text-slate-600">
                Monitor low inventory, schedule AI-driven replenishment, and keep warehouses balanced.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Low Stock SKUs" value={reorderResult?.low_stock_count ?? '—'} />
              <StatCard label="Pending AI Orders" value={reorderResult?.orders_created ?? '—'} />
              <StatCard label="Total Warehouses" value={loadingWarehouses ? '...' : warehouses.length} />
            </div>
          </div>
        </section>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="Stock Health Overview" className="lg:col-span-2">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-slate-500">Warehouse</label>
                  <select 
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    disabled={loadingWarehouses}
                    className="form-input mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">All Warehouses</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.warehouse_code} value={warehouse.warehouse_code}>
                        {warehouse.warehouse_code}
                      </option>
                    ))}
                  </select>
                  {loadingWarehouses && <p className="mt-1 text-xs text-slate-400">Loading...</p>}
                </div>
                <div>
                  <label className="text-sm text-slate-500">Category</label>
                  <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    disabled={loadingCategories}
                    className="form-input mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">All Categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  {loadingCategories && <p className="mt-1 text-xs text-slate-400">Loading...</p>}
                </div>
                <div>
                  <label className="text-sm text-slate-500">SKU</label>
                  <input
                    type="search"
                    placeholder="Search SKU"
                    value={skuSearchInput}
                    onChange={(e) => setSkuSearchInput(e.target.value)}
                    className="form-input mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="table-shell overflow-x-auto rounded-xl border border-slate-100">
                <table className="market-table min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      {['SKU', 'Product', 'Warehouse', 'Current Stock', 'Threshold', 'Status'].map((column) => (
                        <th key={column} className="px-6 py-3">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStock ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-4">
                          <div className="flex items-center justify-center py-8">
                            <Loader className="animate-spin text-blue-500" size={24} />
                          </div>
                        </td>
                      </tr>
                    ) : stockData.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyTableState message="No stock data available" />
                        </td>
                      </tr>
                    ) : (
                      stockData.map((item, index) => {
                        const currentStock = parseInt(item.quantity || 0, 10);
                        const threshold = 10;
                        const isLowStock = currentStock < threshold;
                        const status = isLowStock ? 'Low Stock' : 'Healthy';
                        const statusColor = isLowStock ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800';

                        return (
                          <tr key={`${item.sku}-${item.warehouse_code}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
                            <td data-label="SKU" className="px-6 py-4 text-sm text-slate-900 font-semibold">{item.sku}</td>
                            <td data-label="Product" className="px-6 py-4 text-sm text-slate-600">{item.brand || '-'}</td>
                            <td data-label="Warehouse" className="px-6 py-4 text-sm text-slate-600">{item.warehouse_code}</td>
                            <td data-label="Current Stock" className="px-6 py-4 text-sm text-slate-900 font-semibold">{currentStock}</td>
                            <td data-label="Threshold" className="px-6 py-4 text-sm text-slate-600">{threshold}</td>
                            <td data-label="Status" className="px-6 py-4">
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

        <Card title="AI Reorder Engine">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Launch predictive cycles that balance warehouse capacity and trigger smart vendor outreach. Manual overrides help when urgent replenishment is required.
            </p>
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {successMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                  {successMessage}
                </div>
              )}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleRunReorder}
                  disabled={loading}
                  className="btn btn-primary inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader className="animate-spin mr-2" size={16} />
                      Running Cycle...
                    </>
                  ) : (
                    'Run Forecast Cycle'
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-outline inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Create Manual Request
                </button>
              </div>
            </div>
          </Card>
        </div>

        <Card title="AI Supply Orders">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-600">Live view from backend. Click refresh after dealer action.</p>
              <button
                type="button"
                onClick={loadReorderData}
                className="btn btn-outline inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={loadingAiOrders || loadingAlerts}
              >
                <RefreshCw className={`h-4 w-4 ${loadingAiOrders ? 'animate-spin' : ''}`} />
                <span className="ml-2">Refresh data</span>
              </button>
            </div>
            {fetchError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm">
                {fetchError}
              </div>
            )}
            <div className="table-shell overflow-x-auto rounded-xl border border-slate-100">
              <table className="market-table min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {['Order ID', 'SKU', 'Warehouse', 'Qty', 'Dealer', 'Status', 'Updated'].map((column) => (
                      <th key={column} className="px-6 py-3">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingAiOrders ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader className="animate-spin text-blue-500" size={20} />
                          Loading AI orders...
                        </div>
                      </td>
                    </tr>
                  ) : !aiOrders || aiOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyTableState message="No AI orders found" />
                      </td>
                    </tr>
                  ) : (
                    aiOrders.map((order) => {
                      const badge = statusBadge(order.status);
                      return (
                        <tr key={order.order_id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-semibold text-slate-900">{order.order_id}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{order.sku}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{order.warehouse_code || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-900 font-semibold">{order.quantity ?? '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            <div className="font-medium">{order.dealer_email || '—'}</div>
                            <div className="text-xs text-slate-500">Priority: {order.dealer_priority ?? '—'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            <div>Updated: {formatDateTime(order.updated_at)}</div>
                            <div>Approved: {formatDateTime(order.approved_at)}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {lastUpdated && (
              <p className="text-xs text-slate-500">Last updated: {formatDateTime(lastUpdated)}</p>
            )}
          </div>
        </Card>

        <Card title="Reorder Mail History">
          <div className="space-y-3">
            {loadingAlerts ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader className="animate-spin text-blue-500" size={18} />
                Loading mail history...
              </div>
            ) : alerts.length === 0 ? (
              <EmptyTableState message="No mail/alert history yet" />
            ) : (
              <div className="table-shell overflow-x-auto rounded-xl border border-slate-100">
                <table className="market-table min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      {['SKU / Product', 'Warehouse', 'Message', 'Email Sent To', 'Alert Date'].map((col) => (
                        <th key={col} className="px-6 py-3">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...alerts]
                      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                      .map((alert, idx) => {
                        const badge = levelBadge(alert.level);
                        const sku = alert?.data?.sku || alert?.data?.product_name || '—';
                        const warehouse = alert?.data?.warehouse || alert?.data?.warehouse_code || '—';
                        const email = alert?.data?.email_sent_to || alert?.data?.email || '—';
                        const message = alert?.message || '—';
                        const alertDate = formatDateTime(alert?.created_at);
                        return (
                          <tr key={`${alert.message}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-6 py-3 text-slate-900 font-medium">{sku}</td>
                            <td className="px-6 py-3 text-slate-700">{warehouse}</td>
                            <td className="px-6 py-3 text-slate-700">
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${badge.className} mr-2`}>
                                {badge.label}
                              </span>
                              {message}
                            </td>
                            <td className="px-6 py-3 text-slate-700">{email}</td>
                            <td className="px-6 py-3 text-slate-600 text-xs">{alertDate}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        
      </div>
    </PageContainer>
  );
};

export default Reorder;
