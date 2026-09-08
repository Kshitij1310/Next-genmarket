import { apiFetch } from './api.js';

export const getAllAdminOrders = async () =>
  apiFetch('/api/orders/all_orders');
export const getStripeCheckoutSession = async (customerId) =>
  apiFetch(`/api/${encodeURIComponent(customerId)}/cart/payment-session`);
export const getStripeCheckoutUrl = async (customerId) => {
  const response = await apiFetch(`/api/${encodeURIComponent(customerId)}/cart/payment-session`);
  return response?.checkout_url;
};
export const createStripeCheckout = async (customerId) =>
  apiFetch(`/api/${encodeURIComponent(customerId)}/cart/payment-session`);
export const getAllOrders = async () =>
  apiFetch('/api/orders/all_orders');

export const orderService = {
  createOrder: (payload) =>
    apiFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOrderById: (orderId) => apiFetch(`/api/orders/${encodeURIComponent(orderId)}`),
  getOrderAdminById: (orderId) =>
    apiFetch(`/api/admin_get_by_orderID/${encodeURIComponent(orderId)}`),
  getProductBySkuId: (sku) =>
    apiFetch(`/api/get_bySKU_ID/${encodeURIComponent(sku)}`),
  /**
   * Fetch full order details, preferring admin endpoint (includes items),
   * with graceful fallback to standard order detail if admin route is unavailable.
   */
  getOrderWithFallback: async (orderId) => {
    try {
      const [adminRes, basicRes] = await Promise.allSettled([
        apiFetch(`/api/admin_get_by_orderID/${encodeURIComponent(orderId)}`),
        apiFetch(`/api/orders/${encodeURIComponent(orderId)}`),
      ]);

      const adminOrder = adminRes.status === 'fulfilled' ? adminRes.value : null;
      const basicOrder = basicRes.status === 'fulfilled' ? basicRes.value : null;

      if (!adminOrder && !basicOrder) {
        // fall through to error handling below
        throw adminRes?.reason || basicRes?.reason || new Error('Order not found');
      }

      const isMissing = (value) => value === undefined || value === null || value === '';
      const merged = {
        ...(basicOrder || {}),
        ...(adminOrder || {}),
        payment_method: adminOrder
          ? isMissing(adminOrder?.payment_method)
            ? basicOrder?.payment_method ?? basicOrder?.paymentMethod
            : adminOrder?.payment_method
          : basicOrder?.payment_method ?? basicOrder?.paymentMethod,
        created_at: adminOrder
          ? isMissing(adminOrder?.created_at)
            ? basicOrder?.created_at ?? basicOrder?.createdAt
            : adminOrder?.created_at
          : basicOrder?.created_at ?? basicOrder?.createdAt,
        stripe_payment_id: adminOrder
          ? isMissing(adminOrder?.stripe_payment_id)
            ? basicOrder?.stripe_payment_id ?? basicOrder?.stripePaymentId
            : adminOrder?.stripe_payment_id
          : basicOrder?.stripe_payment_id ?? basicOrder?.stripePaymentId,
        stripe_session_id: adminOrder
          ? isMissing(adminOrder?.stripe_session_id)
            ? basicOrder?.stripe_session_id ?? basicOrder?.stripeSessionId
            : adminOrder?.stripe_session_id
          : basicOrder?.stripe_session_id ?? basicOrder?.stripeSessionId,
        payment_status: adminOrder
          ? isMissing(adminOrder?.payment_status)
            ? basicOrder?.payment_status ?? basicOrder?.paymentStatus
            : adminOrder?.payment_status
          : basicOrder?.payment_status ?? basicOrder?.paymentStatus,
      };

      const stillMissing =
        isMissing(merged?.payment_method) ||
        isMissing(merged?.created_at) ||
        isMissing(merged?.payment_status);

      if (stillMissing) {
        try {
          const allOrders = await apiFetch('/api/orders/all_orders');
          const list = Array.isArray(allOrders?.items)
            ? allOrders.items
            : Array.isArray(allOrders)
              ? allOrders
              : [];
          const matched = list.find(
            (order) =>
              order?.order_id === orderId ||
              order?.orderId === orderId ||
              order?.id === orderId
          );
          if (matched) {
            merged.payment_method = isMissing(merged?.payment_method)
              ? matched?.payment_method ?? matched?.paymentMethod
              : merged.payment_method;
            merged.created_at = isMissing(merged?.created_at)
              ? matched?.created_at ?? matched?.createdAt
              : merged.created_at;
            merged.payment_status = isMissing(merged?.payment_status)
              ? matched?.payment_status ?? matched?.paymentStatus
              : merged.payment_status;
            merged.stripe_payment_id = isMissing(merged?.stripe_payment_id)
              ? matched?.stripe_payment_id ?? matched?.stripePaymentId
              : merged.stripe_payment_id;
            merged.stripe_session_id = isMissing(merged?.stripe_session_id)
              ? matched?.stripe_session_id ?? matched?.stripeSessionId
              : merged.stripe_session_id;
          }
        } catch (mergeError) {
          // ignore all-orders fallback errors
        }
      }

      if (!merged.items && (merged.sku || merged.quantity)) {
        merged.items = [
          {
            sku: merged.sku ?? merged?.items?.[0]?.sku ?? '-',
            quantity: merged.quantity ?? merged?.items?.[0]?.quantity ?? 0,
          },
        ];
      }

      return merged;
    } catch (err) {
      if (err?.status && err.status !== 404) {
        // Non-404 errors bubble up (auth/permission)
        throw err;
      }
      // Fallback to standard order detail
      const basic = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`);
      // If items are missing but sku/quantity exist, synthesize minimal items array for display
      if (!basic.items && (basic.sku || basic.quantity)) {
        basic.items = [
          {
            sku: basic.sku ?? basic?.items?.[0]?.sku ?? '-',
            quantity: basic.quantity ?? basic?.items?.[0]?.quantity ?? 0,
          },
        ];
      }
      return basic;
    }
  },
  /**
   * Fetch full order details and enrich each item with product name (if available).
   */
  getOrderWithProductNames: async (orderId) => {
    const order = await orderService.getOrderWithFallback(orderId);
    const items = Array.isArray(order?.items) ? order.items : [];
    if (items.length === 0) return order;

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const sku = item?.sku;
        if (!sku) return { ...item, name: item?.name ?? '-' };
        try {
         const product = await orderService.getProductBySkuId(sku);
         const name =
           product?.name ||
           product?.product_name ||
           product?.title ||
           product?.product?.name ||
            product?.product?.product_name ||
           product?.data?.name ||
           product?.data?.product_name ||
           product?.data?.title ||
            product?.data?.product?.name ||
            product?.data?.product?.product_name ||
            sku;
          return { ...item, name };
        } catch (error) {
          return { ...item, name: sku };
        }
      })
    );

    return { ...order, items: enrichedItems };
  },
  createAdminCart: ({ customer_id, items }) =>
    apiFetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ customer_id, items }),
    }),
  getStripeCheckoutSession: (customerId) =>
    apiFetch(`/api/${encodeURIComponent(customerId)}/cart/payment-session`),
};
