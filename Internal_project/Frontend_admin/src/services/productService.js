import { apiFetch } from './api.js';

const buildQuery = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const productService = {
  getProducts: ({ page = 1, pageSize = 20, search = '' } = {}) =>
    apiFetch(`/api/products${buildQuery({ page, page_size: pageSize, search })}`),
  getProductBySku: (sku) =>
    apiFetch(`/api/products/${encodeURIComponent(sku)}`),
};
