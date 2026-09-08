import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/apiClient";

/** Central key registry so invalidation stays consistent across pages. */
export const queryKeys = {
  products: (page, pageSize) => ["products", page, pageSize],
  product: (sku) => ["product", sku],
  cart: (customerId) => ["cart", customerId],
  orders: (customerId) => ["orders", customerId],
  order: (customerId, orderId) => ["order", customerId, orderId],
  shipment: (customerId, shipmentId) => ["shipment", customerId, shipmentId],
  tracking: (shipmentId) => ["tracking", shipmentId],
  profile: () => ["profile"],
};

export const useProducts = ({ page = 1, pageSize = 100, enabled = true } = {}) =>
  useQuery({
    queryKey: queryKeys.products(page, pageSize),
    queryFn: () => apiRequest(`/api/products?page=${page}&page_size=${pageSize}`),
    enabled,
  });

export const useCart = (customerId) =>
  useQuery({
    queryKey: queryKeys.cart(customerId),
    queryFn: () => apiRequest(`/api/${encodeURIComponent(customerId)}/cart`),
    enabled: Boolean(customerId),
  });

export const useOrders = (customerId) =>
  useQuery({
    queryKey: queryKeys.orders(customerId),
    queryFn: () => apiRequest(`/api/${encodeURIComponent(customerId)}/orders`),
    enabled: Boolean(customerId),
  });

export const useProfile = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.profile(),
    queryFn: () => apiRequest("/api/profile"),
    enabled,
  });

export const useTracking = (shipmentId) =>
  useQuery({
    queryKey: queryKeys.tracking(shipmentId),
    queryFn: () => apiRequest(`/api/tracking/${encodeURIComponent(shipmentId)}`),
    enabled: Boolean(shipmentId),
  });

/** Replace the cart contents, then refresh anything that reads the cart. */
export const useSaveCart = (customerId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiRequest(`/api/${encodeURIComponent(customerId)}/cart`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart(customerId) });
    },
  });
};

export const usePlaceOrder = (customerId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiRequest("/api/orders", { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders(customerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart(customerId) });
    },
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiRequest("/api/profile", { method: "PUT", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
};
