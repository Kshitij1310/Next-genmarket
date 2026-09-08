import { useState } from "react";
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useQueryClient } from "@tanstack/react-query";

import { queryKeys, useCart, useSaveCart } from "@/hooks/queries";

export default function Cart() {
  const navigate = useNavigate();
  const customerId = localStorage.getItem("customer_id");

  const queryClient = useQueryClient();
  const { data: cartData, isLoading: loading } = useCart(customerId);
  const saveCart = useSaveCart(customerId);

  const [error, setError] = useState("");

  // The query cache is the single source of truth. Quantity buttons write the
  // new list into the cache first so the UI reacts instantly, then persist it.
  const cartItems = cartData?.items || [];

  const setCartItems = (nextItems) => {
    queryClient.setQueryData(queryKeys.cart(customerId), (previous) => ({
      ...(previous || {}),
      items: nextItems,
    }));
  };

  const updateCart = async (nextItems) => {
    const cartId = cartData?.cart_id || localStorage.getItem("cart_id");

    if (!customerId) {
      setError("Missing authentication or customer information.");
      return;
    }

    setError("");

    const payloadItems = nextItems.map((item) => ({
      ...item,
      product_id: item.product_id || item.id || item.sku,
      quantity: Number(item.quantity || 1),
    }));

    try {
      const data = await saveCart.mutateAsync({
        cart_id: cartId,
        items: payloadItems,
      });

      if (data?.cart_id) localStorage.setItem("cart_id", data.cart_id);
    } catch (err) {
      setError(err?.message || "Cart update failed. Please try again.");
    }
  };

  const handleIncrease = (sku) => {
    const nextItems = cartItems.map((item) => {
      if (item.sku !== sku) return item;
      return { ...item, quantity: Number(item.quantity || 1) + 1 };
    });

    setCartItems(nextItems);
    updateCart(nextItems);
  };

  const handleDecrease = (sku) => {
    const nextItems = cartItems
      .map((item) => {
        if (item.sku !== sku) return item;
        return { ...item, quantity: Number(item.quantity || 1) - 1 };
      })
      .filter((item) => Number(item.quantity || 0) > 0);

    setCartItems(nextItems);
    updateCart(nextItems);
  };

  const handleRemove = (sku) => {
    const nextItems = cartItems.filter((item) => item.sku !== sku);
    setCartItems(nextItems);
    updateCart(nextItems);
  };

  const handleOrderNow = () => {
    sessionStorage.setItem("from_cart", "true");
    navigate("/payments", { state: { fromCart: true } });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="h-8 w-40 bg-gray-200 rounded mb-6 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`cart-skeleton-${i}`}
                className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm animate-pulse"
              >
                <div className="h-5 bg-gray-100 rounded w-2/3 mb-3"></div>
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-100 rounded w-1/3 mb-4"></div>
                <div className="h-6 bg-gray-100 rounded w-24 mb-4"></div>
                <div className="h-8 bg-gray-100 rounded w-28"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="p-6">

        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-6">

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Cart</h1>
          </div>
        </div>

          <button
            type="button"
            onClick={handleOrderNow}
            className="bg-blue-200 text-white px-4 py-2 rounded-lg text-sm cursor-not-allowed"
            disabled
          >
            Order Now
          </button>

        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center text-gray-500">
          Your cart is empty.
        </div>

      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* Header with Back Button */}
      <div className="flex items-center justify-between mb-6">

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">
              Cart
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOrderNow}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          Order Now
        </button>

      </div>

      {error && (
        <p className="text-red-500 mb-4">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {cartItems.map((product) => (

          <div
            key={product.sku}
            className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition relative"
          >

            <button
              onClick={() => handleRemove(product.sku)}
              className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 p-2 rounded-lg text-white"
              aria-label={`Remove ${product.name}`}
            >
              <Trash2 size={16} />
            </button>

            <h3 className="text-gray-900 font-semibold">
              {product.name}
            </h3>

            <p className="text-xs text-gray-500 mt-1">
              SKU: {product.sku}
            </p>

            <p className="text-sm text-gray-600 mt-2">
              Brand: {product.brand}
            </p>

            <p className="text-sm text-gray-600">
              Category: {product.category}
            </p>

            <p className="text-lg font-semibold text-blue-600 mt-3">
              {product.currency} {Number(product.price).toFixed(2)}
            </p>

            <div className="flex items-center gap-2 mt-4">

              <button
                type="button"
                onClick={() => handleDecrease(product.sku)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100"
              >
                <Minus size={14} />
              </button>

              <span className="text-sm text-gray-900 min-w-[24px] text-center">
                {Number(product.quantity || 1)}
              </span>

              <button
                type="button"
                onClick={() => handleIncrease(product.sku)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100"
              >
                <Plus size={14} />
              </button>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
