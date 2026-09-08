import { apiFetch } from './api.js';

export const adminService = {
  // primary endpoint exposed to UI. Back-end expects GET /api/profile and PUT /api/profile
  getProfile: () => apiFetch('/api/profile'),
  updateProfile: (payload) =>
    apiFetch('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  // legacy helpers for older code (not currently used)
  getAdminProfile: () => apiFetch('/api/admin/profile'),
  updateAdminProfile: (payload) =>
    apiFetch('/api/admin/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getSettings: () => apiFetch('/api/admin/settings'),
  updateSettings: (payload) =>
    apiFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
