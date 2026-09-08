import { apiFetch } from './api.js';

export const trackingService = {
  getTrackingByShipmentId: (shipmentId) =>
    apiFetch(`/api/tracking/${encodeURIComponent(shipmentId)}`),

  markDelivered: (shipmentId) =>
    apiFetch(`/api/tracking/deliver/${encodeURIComponent(shipmentId)}`, {
      method: 'POST',
    }),
};
