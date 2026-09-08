export const STATUS_STEPS = ['in_warehouse', 'in_transit', 'delivered'];

export const STATUS_LABELS = {
  in_warehouse: 'In Warehouse',
  in_transit: 'In Transit',
  delivered: 'Delivered',
};

const IN_WAREHOUSE = new Set(['confirmed', 'packed', 'shipped']);
const IN_TRANSIT = new Set(['in_transit', 'out_for_delivery']);

export const mapStatusToUi = (rawStatus) => {
  const normalized = String(rawStatus || '').toLowerCase();
  if (IN_WAREHOUSE.has(normalized)) return 'in_warehouse';
  if (IN_TRANSIT.has(normalized)) return 'in_transit';
  if (normalized === 'delivered') return 'delivered';
  return 'in_warehouse';
};

export const getStepIndex = (statusKey) => {
  const index = STATUS_STEPS.indexOf(statusKey);
  return index === -1 ? 0 : index;
};

export const buildStepState = (rawStatus) => {
  const step = mapStatusToUi(rawStatus);
  return { step, index: getStepIndex(step) };
};
