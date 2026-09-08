import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productService } from '../../services/productService.js';
import ProductDetailModal from '../../components/admin/ProductDetailModal.jsx';
import { BASE_URL } from '../../services/api.js';
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

const PLACEHOLDER_IMAGE =
  'https://dummyimage.com/96x96/e2e8f0/475569.png&text=No+Image';

const getImageSource = (item) => {
  let src = getValue(item, ['image', 'image_url', 'imageUrl', 'thumbnail'], '');
  if (!src || src === '-') return '';

  // if the backend gives us a fully qualified URL just return it.  we
  // used to strip the domain and point at `/images/...` so that a local
  // copy could be used, but in development those files often aren’t present
  // and we were seeing every card fall back to the placeholder.  the
  // backend (via ngrok) already serves the same path and the browser will
  // happily fetch it, so prefer the original URL.  a future enhancement
  // could attempt a HEAD request and only rewrite to the pathname when a
  // local asset exists, but for now simplicity wins.
  if (src.startsWith('http')) {
    try {
      const url = new URL(src);
      // if the URL refers to our own backend image path, force it to use
      // whatever BASE_URL is configured (localhost or current ngrok
      // session).  this prevents product entries seeded with an old
      // ngrok domain from breaking when the tunnel rotates.
      if (url.pathname.startsWith('/images/')) {
        return `${BASE_URL}${url.pathname}`;
      }
    } catch (e) {
      // ignore invalid URL
    }
    return src;
  }

  // non‑absolute path – prefix with our API base so images coming from
  // the server still resolve correctly.
  return `${BASE_URL}${src.startsWith('/') ? '' : '/'}${src}`;
};

const PAGE_SIZES = [10, 20, 50];

export default function Products() {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [sortOption, setSortOption] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const detailRequestId = useRef(0);

  useEffect(() => {
    fetchProducts();
  }, [page, pageSize, searchTerm]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      setAccessDenied(false);

      const data = await productService.getProducts({
        page,
        pageSize,
        search: searchTerm,
      });

      const list = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];

      const total =
        Number(getValue(data, ['total', 'totalCount', 'count'], list.length)) || list.length;

      setAllProducts(list);
      setProducts(list);
      setTotalProducts(total);
    } catch (err) {
      if (err?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (err?.status === 403) {
        setAccessDenied(true);
        return;
      }
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setSearchTerm(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    setCategoryFilter('');
    setBrandFilter('');
    setPriceFilter('');
    setSortOption('');
    setPage(1);
  };

  const handleRowClick = async (product) => {
    const sku = toText(getValue(product, ['sku', 'SKU', 'product_sku', 'productSku'], ''));
    setSelectedProduct(product);
    setIsModalOpen(true);
    setDetailError(null);

    if (!sku) {
      setDetailLoading(false);
      setDetailError('SKU not available for this product');
      return;
    }

    setDetailLoading(true);
    const currentRequest = detailRequestId.current + 1;
    detailRequestId.current = currentRequest;
    try {
      const detail = await productService.getProductBySku(sku);
      if (detailRequestId.current !== currentRequest) return;
      setSelectedProduct((prev) => ({ ...prev, ...detail }));
    } catch (err) {
      if (detailRequestId.current !== currentRequest) return;
      setDetailError(err?.message || 'Failed to fetch product details');
    } finally {
      if (detailRequestId.current === currentRequest) {
        setDetailLoading(false);
      }
    }
  };

  const handleCloseModal = () => {
    detailRequestId.current += 1;
    setIsModalOpen(false);
    setDetailLoading(false);
    setDetailError(null);
  };

  const columns = useMemo(
    () => [
      {
        label: 'Image',
        keys: ['image'],
        format: (item) => {
          const src = getImageSource(item) || PLACEHOLDER_IMAGE;
          const alt = toText(getValue(item, ['name', 'sku'], 'Product image'));
          return (
            <div className="flex items-center">
              <div className="h-14 w-14 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                <img
                  src={src}
                  alt={alt}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    if (event.currentTarget.src !== PLACEHOLDER_IMAGE) {
                      event.currentTarget.src = PLACEHOLDER_IMAGE;
                    }
                  }}
                />
              </div>
            </div>
          );
        },
      },
      { label: 'SKU', keys: ['sku'] },
      { label: 'Name', keys: ['name'] },
      { label: 'Brand', keys: ['brand'] },
      { label: 'Category', keys: ['category'] },
      {
        label: 'Price',
        keys: ['price'],
        format: (item) => {
          const price = getValue(item, ['price'], null);
          const currency = getValue(item, ['currency'], 'USD');
          if (price === null || price === '-') return '-';
          return `${currency} ${price}`;
        },
      },
      {
        label: 'Stock Status',
        keys: ['stock_available'],
        format: (item) =>
          getValue(item, ['stock_available'], false) ? 'Available' : 'Out of Stock',
      },
    ],
    []
  );

  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));

  const categories = useMemo(() => {
    const set = new Set();
    allProducts.forEach((p) => {
      const c = toText(getValue(p, ['category', 'product_category'], '')).trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [allProducts]);

  const brands = useMemo(() => {
    const set = new Set();
    allProducts.forEach((p) => {
      const b = toText(getValue(p, ['brand'], '')).trim();
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [allProducts]);

  useEffect(() => {
    let filtered = [...allProducts];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const sku = toText(getValue(item, ['sku', 'SKU', 'product_sku', 'productSku'], '')).toLowerCase();
        const name = toText(getValue(item, ['name', 'product_name', 'productName', 'title'], '')).toLowerCase();
        return sku.includes(q) || name.includes(q);
      });
    }

    if (categoryFilter) {
      filtered = filtered.filter(
        (item) =>
          toText(getValue(item, ['category', 'product_category'], '')).toLowerCase() ===
          categoryFilter.toLowerCase()
      );
    }

    if (brandFilter) {
      filtered = filtered.filter(
        (item) => toText(getValue(item, ['brand'], '')).toLowerCase() === brandFilter.toLowerCase()
      );
    }

    if (priceFilter) {
      filtered = filtered.filter((item) => {
        const price = Number(getValue(item, ['price'], NaN));
        if (Number.isNaN(price)) return false;
        if (priceFilter === 'lt50') return price < 50;
        if (priceFilter === '50to200') return price >= 50 && price <= 200;
        if (priceFilter === '200to500') return price > 200 && price <= 500;
        if (priceFilter === 'gt500') return price > 500;
        return true;
      });
    }

    if (sortOption) {
      filtered.sort((a, b) => {
        const priceA = Number(getValue(a, ['price'], 0));
        const priceB = Number(getValue(b, ['price'], 0));
        const nameA = toText(getValue(a, ['name', 'product_name', 'productName', 'title'], '')).toLowerCase();
        const nameB = toText(getValue(b, ['name', 'product_name', 'productName', 'title'], '')).toLowerCase();
        if (sortOption === 'priceAsc') return priceA - priceB;
        if (sortOption === 'priceDesc') return priceB - priceA;
        if (sortOption === 'nameAsc') return nameA.localeCompare(nameB);
        return 0;
      });
    }

    setProducts(filtered);
  }, [allProducts, searchTerm, categoryFilter, brandFilter, priceFilter, sortOption]);

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container max-w-7xl mx-auto">
        <div className="page-header mb-8">
          <h1 className="page-title text-3xl font-bold text-slate-900">Products</h1>
          <p className="page-subtitle text-slate-500 mt-2">Manage product catalog with live inventory insights.</p>
        </div>

        <div className="surface-card bg-white rounded-xl shadow-xl p-6 mb-6">
          <form onSubmit={handleSearchSubmit} className="filter-bar space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by SKU or product name..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="form-input w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-3">
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-slate-600">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600">Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => {
                    setBrandFilter(e.target.value);
                    setPage(1);
                  }}
                  className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  {brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600">Price Range</label>
                <select
                  value={priceFilter}
                  onChange={(e) => {
                    setPriceFilter(e.target.value);
                    setPage(1);
                  }}
                  className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  <option value="lt50">Below $50</option>
                  <option value="50to200">$50 – $200</option>
                  <option value="200to500">$200 – $500</option>
                  <option value="gt500">Above $500</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-600">Sort</label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="form-input mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Default</option>
                  <option value="priceAsc">Price Low → High</option>
                  <option value="priceDesc">Price High → Low</option>
                  <option value="nameAsc">Product Name A → Z</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        <div className="surface-card bg-white rounded-xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="animate-spin text-blue-500" size={36} />
            </div>
          ) : accessDenied ? (
            <div className="p-6 text-center">
              <p className="text-red-600 font-semibold">Access Denied</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-red-600 font-semibold">Error: {error}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-slate-500">No Data Found</p>
            </div>
          ) : (
            <div className="product-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {products.map((product, index) => {
                const src = getImageSource(product) || PLACEHOLDER_IMAGE;
                const alt = toText(getValue(product, ['name', 'sku'], 'Product image'));
                return (
                  <div
                    key={getValue(product, ['sku', '_id', 'id'], `${index}`)}
                    className="product-card group relative bg-white rounded-2xl shadow-sm border border-slate-100 hover:-translate-y-1 hover:shadow-lg transition-transform duration-200 ease-out overflow-hidden cursor-pointer flex flex-col h-full"
                    onClick={() => handleRowClick(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleRowClick(product);
                      }
                    }}
                  >
                    {/* image container */}
                    <div
                      className="product-media relative bg-slate-50 flex items-center justify-center overflow-hidden"
                      style={{ aspectRatio: '4 / 3' }}
                    >
                      <img
                        src={src}
                        alt={alt}
                        className="w-full h-full object-contain p-4 transition-transform duration-200 group-hover:scale-105"
                        onError={(e) => {
                          if (e.currentTarget.src !== PLACEHOLDER_IMAGE) {
                            e.currentTarget.src = PLACEHOLDER_IMAGE;
                          }
                        }}
                      />
                    </div>

                    {/* details */}
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <h3 className="text-lg font-semibold text-slate-900 leading-tight min-h-[48px] break-words">
                        {getValue(product, ['name'], '-')}
                      </h3>

                      <div className="text-sm text-slate-600 space-y-1 flex-1">
                        <div><span className="font-medium">SKU:</span> <span className="text-slate-700">{getValue(product, ['sku'], '-')}</span></div>
                        <div><span className="font-medium">Brand:</span> <span className="text-slate-700">{getValue(product, ['brand'], '-')}</span></div>
                      </div>

                      <div className="mt-auto flex items-center justify-between pt-1">
                        <span className="text-xs uppercase tracking-wide text-slate-500">Price</span>
                        <span className="inline-flex items-center rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1 text-base font-semibold">
                          {(() => {
                            const price = getValue(product, ['price'], '-');
                            const curr = getValue(product, ['currency'], 'USD');
                            return price === '-' ? '-' : `${curr} ${price}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
          <p className="text-sm text-slate-500">
            Showing {products.length} of {totalProducts} products
          </p>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="form-input border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="btn btn-outline px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="btn btn-outline px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <ProductDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        product={selectedProduct}
        isLoading={detailLoading}
        error={detailError}
      />
    </PageContainer>
  );
}
