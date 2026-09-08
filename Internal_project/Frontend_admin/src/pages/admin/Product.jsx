import { useEffect, useMemo, useState } from 'react';
import { Loader, Search } from 'lucide-react';
import { apiFetch, BASE_URL } from '../../services/api.js';
import PageContainer from '../../components/common/PageContainer';

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

// helpers for image handling
const PLACEHOLDER_IMAGE =
  'https://dummyimage.com/300x300/e2e8f0/475569.png&text=No+Image';

const getImageSource = (item) => {
  let src = getValue(item, ['image', 'image_url', 'imageUrl', 'thumbnail'], '');
  if (!src || src === '-') return '';

  // always return fully qualified URLs unchanged; we previously tried to
  // convert `/images/...` links into plain pathnames so the frontend could
  // serve them locally, but the copy step doesn’t happen automatically and
  // in dev every request ended up failing.  the backend (even via ngrok)
  // responds to the same path and using the full URL avoids needing to
  // mirror assets.
  if (src.startsWith('http')) {
    try {
      const url = new URL(src);
      if (url.pathname.startsWith('/images/')) {
        return `${BASE_URL}${url.pathname}`;
      }
    } catch (e) {
      // ignore bad URLs
    }
    return src;
  }

  return `${BASE_URL}${src.startsWith('/') ? '' : '/'}${src}`;
};

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

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/products');
      console.log('Products API response:', data);
      setProducts(normalizeArray(data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { label: 'SKU', keys: ['sku', 'SKU', 'product_sku', 'productSku', 'code'] },
    {
      label: 'Product Name',
      keys: ['product_name', 'productName', 'name', 'title'],
    },
    { label: 'Brand', keys: ['brand', 'manufacturer', 'maker'] },
    { label: 'Category', keys: ['category', 'type', 'group'] },
    { label: 'Quantity', keys: ['quantity', 'qty', 'stock', 'available_qty'] },
    { label: 'Reserved Qty', keys: ['reserved_qty', 'reservedQty', 'reserved'] },
    {
      label: 'Updated At',
      keys: ['updated_at', 'updatedAt', 'updated', 'modified_at', 'modifiedAt'],
      format: (item) =>
        formatDate(
          getValue(
            item,
            ['updated_at', 'updatedAt', 'updated', 'modified_at', 'modifiedAt'],
            null
          )
        ),
    },
  ];
  // columns are retained for compatibility but not used in the new card layout


  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      const nameValue = getValue(product, ['product_name', 'productName', 'name', 'title'], '');
      return toText(nameValue).toLowerCase().includes(term);
    });
  }, [products, searchTerm]);

  return (
    <PageContainer className="bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 mt-2">Manage and view all products in the system</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="animate-spin text-blue-500" size={32} />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-red-600 font-semibold">Error: {error}</p>
              <button
                onClick={fetchProducts}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Retry
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500">No Products Found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map((product, index) => {
                const src = getImageSource(product) || PLACEHOLDER_IMAGE;
                const altText =
                  toText(getValue(product, ['product_name', 'name', 'title'], 'Product')) ||
                  toText(getValue(product, ['sku'], ''));

                return (
                  <div
                    key={product._id || product.id || product.sku || `card-${index}`}
                    className="bg-white rounded-lg shadow hover:shadow-lg overflow-hidden flex flex-col"
                  >
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                      <img
                        src={src}
                        alt={altText}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          if (e.currentTarget.src !== PLACEHOLDER_IMAGE) {
                            e.currentTarget.src = PLACEHOLDER_IMAGE;
                          }
                        }}
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {getValue(product, ['product_name', 'name', 'title'], '-')}
                      </h2>
                      <p className="text-gray-500 text-sm mt-1 flex-1">
                        {getValue(product, ['description', 'desc'], '-')}
                      </p>
                      <div className="mt-3">
                        <span className="text-sm font-medium text-gray-900">
                          {getValue(product, ['sku', 'SKU', 'product_sku', 'productSku'], '-')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!loading && !error && filteredProducts.length > 0 && (
          <div className="mt-4 text-sm text-gray-500 text-right">
            Showing {filteredProducts.length} of {products.length} products
          </div>
        )}
      </div>
    </PageContainer>
  );
}
