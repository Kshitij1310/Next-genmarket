import { useEffect, useMemo, useState } from 'react';
import { Loader, Search } from 'lucide-react';
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

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const cleanWarehouseCode = (code) => {
  if (!code) return '';
  return String(code).trim().replace(/\s+/g, ' ');
};

export default function Inventory() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      setError(null);
      setAccessDenied(false);
      const { list } = await inventoryService.getWarehouses();
      console.log('Inventory Warehouses API:', list);
      const flattenedItems = (list || []).flatMap((warehouse) => {
        const products = Array.isArray(warehouse?.products)
          ? warehouse.products
          : Array.isArray(warehouse?.items)
            ? warehouse.items
            : [];
        const warehouseCode = cleanWarehouseCode(
          getValue(warehouse, ['warehouse_code', 'code', 'warehouseCode', 'warehouse_id'])
        );
        const warehouseName = getValue(warehouse, ['warehouse_name', 'name'], '');

        return products.map((product) => ({
          ...product,
          warehouse_code: getValue(product, ['warehouse_code', 'warehouseCode', 'warehouse'], warehouseCode),
          warehouse_name: getValue(product, ['warehouse_name', 'warehouseName', 'warehouse_name'], warehouseName),
        }));
      });
      setWarehouses(list);
      setInventoryItems(flattenedItems);
      setSelectedWarehouse('');
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
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const scopedItems = selectedWarehouse
      ? inventoryItems.filter(
          (item) =>
            cleanWarehouseCode(
              getValue(item, ['warehouse_code', 'warehouseCode', 'warehouse', 'warehouse_id'])
            ) === selectedWarehouse
        )
      : inventoryItems;
    if (!term) return scopedItems;
    return scopedItems.filter((item) => {
      const sku = getValue(item, ['sku', 'SKU', 'product_sku', 'productSku', 'code']);
      return toText(sku).toLowerCase().includes(term);
    });
  }, [inventoryItems, searchTerm, selectedWarehouse]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
  };

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container max-w-7xl mx-auto">
        <div className="page-header mb-8">
          <h1 className="page-title text-3xl font-bold text-slate-900">Inventory</h1>
          <p className="page-subtitle text-slate-500 mt-2">Track inventory by warehouse and SKU.</p>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="surface-card filter-bar bg-white rounded-xl shadow-xl p-6 mb-6 flex flex-col lg:flex-row gap-4"
        >
          <div className="flex-1">
            <label className="text-sm text-slate-500">Warehouse</label>
            <select
              value={selectedWarehouse}
              onChange={(event) => {
                const warehouseCode = event.target.value;
                console.log('Warehouse dropdown changed to:', warehouseCode);
                setSelectedWarehouse(warehouseCode);
              }}
              className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
            >
              <option value="">All Warehouses</option>
              {Array.from(
                new Set(
                  warehouses.map((warehouse) =>
                    cleanWarehouseCode(getValue(warehouse, ['warehouse_code', 'code', 'warehouseCode']))
                  )
                )
              )
                .filter(Boolean)
                .sort()
                .map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-sm text-slate-500">Search SKU</label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by SKU..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="form-input w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="btn btn-primary bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Search
            </button>
            <button
              type="button"
              onClick={handleClearSearch}
              className="btn btn-outline border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition"
            >
              Clear
            </button>
          </div>
        </form>

        <div className="surface-card bg-white rounded-xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="animate-spin text-blue-500" size={36} />
            </div>
          ) : accessDenied ? (
            <div className="p-6 text-center">
              <p className="text-red-600 font-semibold">Admin access required</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-red-600 font-semibold">Error: {error}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-slate-500">No Data Found</p>
            </div>
          ) : (
            <div className="table-shell overflow-x-auto">
              <table className="market-table w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    {[
                      'Warehouse Code',
                      'SKU',
                      'Brand',
                      'Category',
                      'Quantity',
                      'Price',
                      'Currency',
                      'Bin Location',
                    ].map((label) => (
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
                  {filteredItems.map((item, index) => {
                    const quantity = toNumber(
                      getValue(item, ['quantity', 'qty', 'available_qty', 'available'], 0)
                    );
                    const isLowStock = quantity < 10;

                    return (
                      <tr
                        key={getValue(item, ['_id', 'id'], `${index}`)}
                        className={`border-b border-slate-100 hover:bg-blue-50 transition ${
                          index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                        } ${isLowStock ? 'bg-red-50/60' : ''}`}
                      >
                        <td data-label="Warehouse Code" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, [
                            'warehouse_code',
                            'warehouseCode',
                            'warehouse',
                            'warehouse_id',
                          ])}
                        </td>
                        <td data-label="SKU" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, ['sku', 'SKU', 'product_sku', 'productSku', 'code'])}
                        </td>
                        <td data-label="Brand" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, ['brand', 'manufacturer', 'maker'])}
                        </td>
                        <td data-label="Category" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, ['category', 'type', 'group'])}
                        </td>
                        <td data-label="Quantity" className="px-6 py-4 text-sm text-slate-700">{quantity}</td>
                        <td data-label="Price" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, ['price'], '-')}
                        </td>
                        <td data-label="Currency" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, ['currency'], 'USD')}
                        </td>
                        <td data-label="Bin Location" className="px-6 py-4 text-sm text-slate-700">
                          {getValue(item, ['bin_location', 'binLocation', 'bin'])}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
