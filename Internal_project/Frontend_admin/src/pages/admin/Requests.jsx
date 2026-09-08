import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { productService } from '../../services/productService.js';
import PageContainer from '../../components/common/PageContainer';

const REQUEST_TYPES = [
  { label: 'Purchase', value: 'purchase' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Manual Order', value: 'manual' },
];

const Requests = () => {
  const [requestType, setRequestType] = useState('purchase');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productError, setProductError] = useState('');

  useEffect(() => {
    if (!isModalOpen || products.length > 0 || isLoadingProducts) return;

    const fetchProducts = async () => {
      try {
        setIsLoadingProducts(true);
        setProductError('');
        const data = await productService.getProducts({ page: 1, pageSize: 50 });
        const list = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
        setProducts(list);
      } catch (error) {
        setProductError(error?.message || 'Unable to load products');
      } finally {
        setIsLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [isModalOpen, products.length, isLoadingProducts]);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      const sku = String(product?.sku || '').toLowerCase();
      const name = String(product?.name || '').toLowerCase();
      return sku.includes(term) || name.includes(term);
    });
  }, [products, productSearch]);

  const handleAddProduct = (product) => {
    if (!product?.sku) return;
    const exists = items.some((item) => item.sku === product.sku);
    if (exists) {
      toast.error('Product already added');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        sku: product.sku,
        name: product.name || product.title || product.sku,
        quantity: 1,
      },
    ]);
    setIsModalOpen(false);
    setProductSearch('');
  };

  const handleQuantityChange = (index, value) => {
    const nextValue = Number(value) || 0;
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, quantity: Math.max(1, nextValue) } : item
      )
    );
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!items.length) {
      toast.error('Add at least one product');
      return;
    }
    const payload = {
      type: requestType,
      notes: notes.trim(),
      items: items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
    };
    console.log('Request payload:', payload);
    toast.success('Request prepared. Backend integration pending.');
  };

  return (
    <PageContainer className="bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Create Request</h1>
          <p className="mt-2 text-sm text-slate-600">
            Submit purchasing or transfer intents for coordination with supply teams.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <label className="text-sm text-slate-500">Request Type</label>
                <select
                  value={requestType}
                  onChange={(event) => setRequestType(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {REQUEST_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-500">Notes</label>
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add additional context for procurement or logistics teams"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Items</h2>
                <p className="text-sm text-slate-500">Add SKUs that need replenishment</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                + Add Product
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {['SKU', 'Product Name', 'Quantity', ''].map((column) => (
                      <th key={column} className="px-6 py-3">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500">
                        No products added yet
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.sku} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-semibold text-slate-900">{item.sku}</td>
                        <td className="px-6 py-4 text-slate-700">{item.name}</td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) => handleQuantityChange(index, event.target.value)}
                            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-sm font-medium text-rose-600 hover:text-rose-700"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Submit Request
            </button>
          </div>
        </form>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Select Product</h3>
                <p className="text-sm text-slate-500">Pick from available catalog</p>
              </div>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-700"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search SKU or product name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />

              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-100">
                {isLoadingProducts ? (
                  <div className="py-10 text-center text-sm text-slate-500">Loading products...</div>
                ) : productError ? (
                  <div className="py-10 text-center text-sm text-rose-600">{productError}</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-500">No products found</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3">SKU</th>
                        <th className="px-5 py-3">Name</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => (
                        <tr key={product.sku} className="border-t border-slate-100">
                          <td className="px-5 py-3 font-semibold text-slate-900">{product.sku}</td>
                          <td className="px-5 py-3 text-slate-700">{product.name || product.title}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleAddProduct(product)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Add
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default Requests;
