import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ShoppingCart,
  ArrowLeft,
  Sparkles,
  Store,
  Filter,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import LoadingOverlay from "../components/LoadingOverlay";
import { useCart, useProducts, useSaveCart } from "@/hooks/queries";

const API_BASE =
  (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

// The category chips are a coarse grouping; the catalog itself uses finer
// categories (headphones, chargers, wearables, ...) that fold into them.
const CATEGORY_BUCKETS = {
  earbuds: ["earbuds", "headphones"],
  fashion: ["fashion", "backpacks", "cases", "wearables"],
  grocery: ["grocery"],
  laptops: ["laptops", "cooling_pads", "usb_hubs", "wireless_mice"],
  phones: ["phones", "chargers"],
};

const getCategoryBucket = (product) => {
  const raw = (product?.category || "").toString().toLowerCase().trim();
  const bucket = Object.keys(CATEGORY_BUCKETS).find((key) =>
    CATEGORY_BUCKETS[key].includes(raw),
  );
  return bucket || raw;
};

export default function Products() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [sortOption, setSortOption] = useState("default");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [showCartModal, setShowCartModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const categories = ["all", "earbuds", "fashion", "grocery", "laptops", "phones"];

  const customerId = localStorage.getItem("customer_id");

  const {
    data: productsData,
    isLoading: loading,
    isError,
    error: productsError,
  } = useProducts({ page, pageSize });

  const products = useMemo(() => productsData?.items || [], [productsData]);
  const total = Number(
    productsData?.total ?? productsData?.count ?? products.length ?? 0,
  );
  const error = isError ? productsError?.message || "Failed to load products" : "";

  // Cart lives in the query cache, so adding an item here also refreshes the
  // badge on every other screen that reads it.
  const { data: cartData } = useCart(customerId);
  const cartCount = cartData?.items?.length || 0;
  const saveCart = useSaveCart(customerId);

  const getProductImage = (product) => {
    const raw =
      typeof product?.image_url === "string"
        ? product.image_url.trim()
        : "";

    if (!raw) return "/images/product-placeholder.svg";

    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

    const normalized = raw.replace(/^\/+/, "");
    return `${API_BASE}/${normalized}`;
  };

  const getDiscountInfo = (product) => {
    const status = product?.sale_status ?? product?.discount_active;
    const active =
      status === "discount_active" ||
      status === true ||
      status === "true";

    if (!active) return { active: false };

    const discounted = Number(
      product?.discounted_price ?? product?.price ?? 0
    );

    const originalFromApi =
      product?.original_price != null
        ? Number(product.original_price)
        : null;

    const percentFromApi =
      product?.discount_percent != null
        ? Number(product.discount_percent)
        : null;

    const percent =
      percentFromApi != null
        ? Math.round(percentFromApi)
        : originalFromApi && originalFromApi > 0
          ? Math.max(
              0,
              Math.round(((originalFromApi - discounted) / originalFromApi) * 100)
            )
          : null;

    const derivedOriginal =
      originalFromApi && originalFromApi > 0
        ? originalFromApi
        : percent != null && percent > 0
          ? Number((discounted / (1 - percent / 100)).toFixed(2))
          : null;

    return {
      active: true,
      percent,
      original: derivedOriginal,
      discounted,
    };
  };

  useEffect(() => {
    if (cartData?.cart_id) localStorage.setItem("cart_id", cartData.cart_id);
  }, [cartData?.cart_id]);

  const availableBrands = useMemo(() => {
    const brands = new Set();
    products.forEach((product) => {
      const brand = (product?.brand || "").toString().trim();
      if (brand) brands.add(brand);
    });
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim();

    const inPriceRange = (product) => {
      const price = Number(product?.price ?? product?.discounted_price ?? product?.discounted ?? 0);
      if (Number.isNaN(price) || price <= 0) return priceFilter === "all";
      switch (priceFilter) {
        case "lt50":
          return price < 50;
        case "50-200":
          return price >= 50 && price <= 200;
        case "200-500":
          return price > 200 && price <= 500;
        case "gt500":
          return price > 500;
        default:
          return true;
      }
    };

    const matches = products.filter((product) => {
      if (activeCategory !== "all" && getCategoryBucket(product) !== activeCategory) return false;

      if (brandFilter !== "all") {
        const brand = (product.brand || "").toString().toLowerCase().trim();
        if (brand !== brandFilter.toLowerCase()) return false;
      }

      if (!inPriceRange(product)) return false;

      if (!query) return true;

      return (
        product.name?.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query) ||
        product.brand?.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query)
      );
    });

    const sorter = {
      default: () => 0,
      "price-asc": (a, b) => (Number(a.price ?? 0) || 0) - (Number(b.price ?? 0) || 0),
      "price-desc": (a, b) => (Number(b.price ?? 0) || 0) - (Number(a.price ?? 0) || 0),
      "name-asc": (a, b) => (a.name || "").localeCompare(b.name || ""),
    };

    return matches.sort(sorter[sortOption] || sorter.default);
  }, [products, search, activeCategory, brandFilter, priceFilter, sortOption]);

  const handleAddToCart = async (product) => {
    const token = localStorage.getItem("token");

    if (!token || !customerId) {
      toast.error("Please login first.");
      return;
    }

    const existingItems = cartData?.items || [];
    const cartId = cartData?.cart_id || localStorage.getItem("cart_id");

    const nextItems = existingItems.map((item) => ({ ...item }));
    const existingIndex = nextItems.findIndex((item) => item.sku === product.sku);

    if (existingIndex >= 0) {
      nextItems[existingIndex] = {
        ...nextItems[existingIndex],
        quantity: Number(nextItems[existingIndex].quantity || 1) + 1,
      };
    } else {
      nextItems.push({
        sku: product.sku,
        name: product.name,
        price: Number(product.price),
        quantity: 1,
        currency: product.currency,
        brand: product.brand,
        category: product.category,
        stock_available: product.stock_available,
      });
    }

    const payloadItems = nextItems.map((item) => ({
      ...item,
      product_id: item.product_id || item.id || item.sku,
      quantity: Number(item.quantity || 1),
    }));

    try {
      // The mutation invalidates the cart query, so the badge here and the
      // Cart page both refresh without a manual event bus.
      const updateData = await saveCart.mutateAsync({
        cart_id: cartId,
        items: payloadItems,
      });

      if (updateData?.cart_id) {
        localStorage.setItem("cart_id", updateData.cart_id);
      }

      setSelectedProduct(product);
      setShowCartModal(true);
    } catch (err) {
      toast.error(err?.message || "Failed to add to cart.");
    }
  };

  const getBadge = (product, index) => {
    const key = `${product?.sku || ""}${index}`;
    const seed = key.length % 3;
    if (seed === 0) return "Bestseller";
    if (seed === 1) return "New";
    return "Featured";
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-outline flex items-center gap-2 px-3 py-2 text-sm"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="flex items-center gap-2">
            <Store size={20} className="text-primary" />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">
                Catalog
              </p>
              <h1 className="page-title text-2xl">Products</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card border border-slate-200 rounded-2xl p-5 mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-center">
          <div className="flex items-center gap-3 w-full">
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl shadow-sm w-full">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search products, SKU, or brand..."
                className="form-input bg-transparent outline-none text-sm text-slate-700 w-full border-0 focus:ring-0 focus:border-transparent"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="filter-bar flex flex-wrap items-center gap-3 bg-white">
            <Filter size={16} className="text-slate-500" />

            <select
              value={activeCategory}
              onChange={(e) => {
                setActiveCategory(e.target.value);
                setPage(1);
              }}
              className="form-input px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All Categories" : c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={brandFilter}
              onChange={(e) => {
                setBrandFilter(e.target.value);
                setPage(1);
              }}
              className="form-input px-3 py-2 text-sm"
            >
              <option value="all">All Brands</option>
              {availableBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>

            <select
              value={priceFilter}
              onChange={(e) => {
                setPriceFilter(e.target.value);
                setPage(1);
              }}
              className="form-input px-3 py-2 text-sm"
            >
              <option value="all">Price: All</option>
              <option value="lt50">Below $50</option>
              <option value="50-200">$50 – $200</option>
              <option value="200-500">$200 – $500</option>
              <option value="gt500">Above $500</option>
            </select>

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="form-input px-3 py-2 text-sm"
            >
              <option value="default">Sort: Default</option>
              <option value="price-asc">Price Low → High</option>
              <option value="price-desc">Price High → Low</option>
              <option value="name-asc">Product Name A → Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white/90 border border-slate-200 rounded-2xl shadow-sm p-6">
        <LoadingOverlay show={loading || saveCart.isPending} label={loading ? "Loading products..." : "Updating cart..."} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Sparkles size={16} className="text-primary" />
            <span>
              Showing {filteredProducts.length} of {total || products.length} items
            </span>
          </div>
          <button
            onClick={() => navigate("/cart")}
            className="relative btn btn-outline bg-white border border-slate-200 p-2 rounded-lg shadow-sm hover:shadow"
          >
            <ShoppingCart size={18} />

            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-white text-xs font-semibold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden animate-pulse"
              >
                <div className="h-48 bg-gray-100"></div>
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-100 rounded w-2/3"></div>
                  <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-100 rounded w-3/4"></div>
                  <div className="h-8 bg-gray-100 rounded w-full"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-red-500">{error}</p>
        )}

        {!loading && !error && (

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

            {filteredProducts.map((product, index) => {
              const discount = getDiscountInfo(product);

              return (
                <div
                  key={product.sku}
                  className="surface-card bg-white border border-slate-200 rounded-2xl hover:shadow-md transition overflow-hidden relative group"
                >
                  <button
                    onClick={() => handleAddToCart(product)}
                    className="absolute top-4 right-4 btn btn-primary p-2 rounded-lg shadow transition"
                  >
                    <ShoppingCart size={16} className="text-white" />
                  </button>

                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <div className="bg-white/90 text-slate-900 text-xs font-semibold px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                      <Sparkles size={12} className="text-primary" />
                      {getBadge(product, index)}
                    </div>

                    {discount.active && (
                      <div className="bg-red-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        {discount.percent != null
                          ? `${discount.percent}% OFF`
                          : "SALE"}
                      </div>
                    )}
                  </div>

                  <div className="h-48 flex items-center justify-center bg-gray-50 border-b border-gray-200">
                    <img
                      src={getProductImage(product)}
                      alt={product.name}
                      className="h-32 object-contain transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => {
                        if (
                          e.currentTarget.src.endsWith(
                            "/images/product-placeholder.svg"
                          )
                        )
                          return;

                        e.currentTarget.src =
                          "/images/product-placeholder.svg";
                      }}
                    />
                  </div>

                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {product.name}
                    </h3>

                    <p className="text-sm text-slate-500">
                      SKU: {product.sku}
                    </p>

                    <p className="text-sm text-slate-600 mt-1">
                      Brand: {product.brand}
                    </p>

                    <p className="text-sm text-slate-600">
                      Category: {product.category}
                    </p>

                    {discount.active ? (
                      <>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-wide text-slate-400">
                            Price
                          </span>
                          <div className="flex items-center gap-2">
                            {discount.original ? (
                              <span className="text-sm text-slate-400 line-through">
                                {product.currency}{" "}
                                {Number(discount.original).toFixed(2)}
                              </span>
                            ) : null}
                            {discount.percent != null && (
                              <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-lg">
                                {discount.percent}% OFF
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-wide text-slate-500">
                            Now
                          </span>
                          <span className="bg-primary-50 text-primary text-sm font-semibold px-3 py-1 rounded-lg">
                            {product.currency}{" "}
                            {Number(discount.discounted).toFixed(2)}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-red-600 font-semibold text-right">
                          Expiry Sale
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          Price
                        </span>

                        <span className="bg-primary-50 text-primary text-sm font-semibold px-3 py-1 rounded-lg">
                          {product.currency}{" "}
                          {Number(product.price).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          </div>

        )}

        {!loading && !error && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || loading}
              className="btn btn-outline px-4 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white disabled:opacity-50"
            >
              Prev
            </button>

            <span className="text-sm text-slate-600">
              Page {page} of {Math.max(1, Math.ceil((total || 0) / (pageSize || 1)))}
            </span>

            <button
              onClick={() =>
                setPage((prev) =>
                  prev < Math.ceil((total || 0) / (pageSize || 1)) ? prev + 1 : prev
                )
              }
              disabled={page >= Math.ceil((total || 0) / (pageSize || 1)) || loading}
              className="btn btn-outline px-4 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {!loading && !error && filteredProducts.length === 0 && (
          <div className="surface-card bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center text-slate-500">
            No products found.
          </div>
        )}

        {showCartModal && (
          <div className="product-modal-overlay">
            <div className="product-modal-card">
              <button
                type="button"
                onClick={() => setShowCartModal(false)}
                className="product-modal-close"
                aria-label="Close"
              >
                x
              </button>

              <div className="product-modal-header">
                <p className="product-modal-eyebrow">Cart Updated</p>
                <h3 className="product-modal-title">Item added successfully</h3>
              </div>

              <p className="text-sm text-slate-600 mb-6">
                {selectedProduct?.name || "Your item"} is now in your cart.
              </p>

              <div className="product-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowCartModal(false)}
                  className="btn btn-outline px-4 py-2 text-sm font-medium"
                >
                  Continue Shopping
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/cart")}
                  className="product-modal-cta ml-3"
                >
                  View Cart
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
