export const ORDER_UPDATED_EVENT = 'order_updated';

export const notifyOrderUpdated = () => {
  window.dispatchEvent(new Event(ORDER_UPDATED_EVENT));
};

export const subscribeOrderUpdates = (callback) => {
  window.addEventListener(ORDER_UPDATED_EVENT, callback);
  return () => window.removeEventListener(ORDER_UPDATED_EVENT, callback);
};
