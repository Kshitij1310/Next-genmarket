import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { inventoryService } from '../../services/inventoryService.js';
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

const cleanWarehouseCode = (code) => (code ? String(code).trim().replace(/\s+/g, ' ') : '');

export default function ExpiryAlerts() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [saleStatus, setSaleStatus] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    fetchWarehouses();
    fetchExpiryAlerts();
  }, []);

  useEffect(() => {
    fetchExpiryAlerts({ warehouseCode: selectedWarehouse, saleStatus });
  }, [selectedWarehouse, saleStatus]);

  const fetchWarehouses = async () => {
    try {
      setError(null);
      setAccessDenied(false);
      const { list } = await inventoryService.getWarehouses();
      const fromWarehousesApi = Array.isArray(list) ? list : [];

      // Fallback: also pull warehouse codes from expiry alerts data if present
      // to avoid empty dropdowns when the warehouses API returns minimal info.
      let merged = fromWarehousesApi;
      try {
        const { data } = await inventoryService.getExpiryAlerts();
        const alerts = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        const codes = alerts
          .map((item) => cleanWarehouseCode(getValue(item, ['warehouse_code', 'warehouse', 'warehouseId', 'warehouse_id'])))
          .filter(Boolean);
        const existingCodes = new Set(
          merged.map((w) => cleanWarehouseCode(getValue(w, ['warehouse_code', 'code', 'warehouseCode'])))
        );
        codes.forEach((code) => {
          if (code && !existingCodes.has(code)) {
            merged.push({ warehouse_code: code });
            existingCodes.add(code);
          }
        });
      } catch (fallbackErr) {
        // silently ignore fallback errors
      }

      setWarehouses(merged);
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setAccessDenied(true);
        return;
      }
      setError(err.message || 'Request failed');
    }
  };

  const fetchExpiryAlerts = async ({ warehouseCode, saleStatus } = {}) => {
    try {
      setListLoading(true);
      setError(null);
      setAccessDenied(false);
      const { data } = await inventoryService.getExpiryAlerts({
        warehouseCode: warehouseCode || undefined,
        saleStatus: saleStatus || undefined,
      });
      setResult(data || null);
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setAccessDenied(true);
        return;
      }
      setError(err.message || 'Request failed');
      setResult(null);
    } finally {
      setListLoading(false);
    }
  };

  const handleRefresh = async (event) => {
    event?.preventDefault?.();
    setLoading(true);
    await fetchExpiryAlerts({ warehouseCode: selectedWarehouse, saleStatus });
    setLoading(false);
  };

  const items = useMemo(() => {
    const list = Array.isArray(result?.items) ? result.items : [];
    const filtered = selectedWarehouse
      ? list.filter(
          (item) =>
            cleanWarehouseCode(getValue(item, ['warehouse_code', 'warehouse', 'warehouseId', 'warehouse_id'])) ===
            cleanWarehouseCode(selectedWarehouse)
        )
      : list;

    return [...filtered].sort((a, b) => {
      const aDate = new Date(getValue(a, ['expiry_date', 'expiryDate', 'expires_on']));
      const bDate = new Date(getValue(b, ['expiry_date', 'expiryDate', 'expires_on']));
      return aDate - bDate;
    });
  }, [result, selectedWarehouse]);

  const getDaysLeft = (item) => {
    const expiry = new Date(getValue(item, ['expiry_date', 'expiryDate', 'expires_on']));
    if (Number.isNaN(expiry.getTime())) return null;
    const now = new Date();
    // Strip time to avoid off-by-one due to time zones
    const utcExpiry = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
    const utcToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.ceil((utcExpiry - utcToday) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const badgeTone = (days) => {
    if (days === null || days === undefined) return 'bg-slate-100 text-slate-700';
    if (days <= 7) return 'bg-red-100 text-red-700';
    if (days <= 14) return 'bg-amber-100 text-amber-700';
    if (days <= 30) return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-700';
  };

  const warehouseOptions = useMemo(() => {
    return Array.from(
      new Set(
        warehouses.map((warehouse) =>
          cleanWarehouseCode(getValue(warehouse, ['warehouse_code', 'code', 'warehouseCode']))
        )
      )
    ).filter(Boolean);
  }, [warehouses]);

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container max-w-7xl mx-auto">
        <div className="page-header mb-8 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h1 className="page-title text-3xl font-bold text-slate-900">Expiry Alerts</h1>
            <p className="page-subtitle text-slate-500 mt-1">
              Trigger expiry alerts per warehouse and review products nearing expiry.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleRefresh}
          className="surface-card bg-white rounded-xl shadow-xl p-6 mb-6 grid grid-cols-1 lg:grid-cols-4 gap-4"
        >
          <div className="lg:col-span-2">
            <label className="text-sm text-slate-500">Warehouse</label>
            <select
              value={selectedWarehouse}
              onChange={(event) => setSelectedWarehouse(event.target.value)}
              className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
            >
              <option value="">All Warehouses</option>
              {warehouseOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-500">Sale Status</label>
            <select
              value={saleStatus}
              onChange={(event) => setSaleStatus(event.target.value)}
              className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
            >
              <option value="">All</option>
              <option value="discount_active">Discount Active</option>
              <option value="discount_inactive">Discount Inactive</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin" size={16} /> Triggering...
                </>
              ) : (
                <>
                  <RefreshCw size={16} /> Refresh Alerts
                </>
              )}
            </button>
          </div>
        </form>

        {accessDenied ? (
          <div className="surface-card bg-white rounded-xl shadow-xl p-6 text-center text-red-600 font-semibold">
            Admin access required
          </div>
        ) : error ? (
          <div className="surface-card bg-white rounded-xl shadow-xl p-6 text-center text-red-600 font-semibold">
            {error}
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="surface-card bg-white rounded-xl shadow-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-slate-500">Warehouse</p>
                <p className="text-lg font-semibold text-slate-900">
                  {selectedWarehouse || getValue(result, ['warehouse_code', 'warehouseCode', 'warehouse'], 'All')}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Items Flagged</p>
                <p className="text-lg font-semibold text-slate-900">
                  {getValue(result, ['count', 'items_count'], items.length)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Last Refreshed</p>
                <p className="text-sm font-medium text-slate-700">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="surface-card bg-white rounded-xl shadow-xl overflow-hidden">
              {listLoading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
                  <Loader className="animate-spin" size={20} />
                  Loading expiry alerts...
                </div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No expiring products found.</div>
              ) : (
                <div className="table-shell overflow-x-auto">
                  <table className="market-table w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {['Warehouse', 'SKU', 'Product', 'Quantity', 'Expiry Date', 'Days Left', 'Sale Status'].map((label) => (
                          <th
                            key={label}
                            className="sticky top-0 bg-slate-100 px-6 py-3 text-left text-sm font-semibold text-slate-700"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr
                          key={getValue(item, ['sku', 'product_sku', '_id', 'id'], `${index}`)}
                          className={`border-b border-slate-100 hover:bg-amber-50 transition ${
                            index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                          }`}
                        >
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {getValue(
                              item,
                              ['warehouse_code', 'warehouseCode', 'warehouse', 'warehouse_id'],
                              getValue(result, ['warehouse_code', 'warehouse'])
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {getValue(item, ['sku', 'product_sku', 'SKU', 'code'])}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-800">
                            {getValue(item, ['product_name', 'name', 'title', 'productName'], '-')}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {getValue(item, ['quantity', 'qty', 'available_qty', 'available'], '-')}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {formatDate(getValue(item, ['expiry_date', 'expiryDate', 'expires_on']))}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {(() => {
                              const days = getDaysLeft(item);
                              return (
                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(days)}`}>
                                  {Number.isFinite(days) ? `${days} days` : 'N/A'}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {getValue(item, ['sale_status', 'saleStatus', 'status'], '-')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="surface-card bg-white rounded-xl shadow-xl p-8 text-center text-slate-500">
            Trigger the alert to see expiring products.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
