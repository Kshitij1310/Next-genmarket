import { create } from "zustand";

/**
 * Session state, mirrored to localStorage.
 *
 * localStorage stays the source of truth on load because the rest of the app
 * (and the notification socket) still reads the raw token from there.
 */
const readSession = () => ({
  token: localStorage.getItem("token") || null,
  customerId: localStorage.getItem("customer_id") || null,
  isLoggedIn: localStorage.getItem("isLoggedIn") === "true",
});

export const useAuthStore = create((set) => ({
  ...readSession(),

  setSession: ({ token, customerId }) => {
    if (token) localStorage.setItem("token", token);
    if (customerId) localStorage.setItem("customer_id", customerId);
    localStorage.setItem("isLoggedIn", "true");
    set({ token: token || null, customerId: customerId || null, isLoggedIn: true });
  },

  clearSession: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("customer_id");
    localStorage.removeItem("cart_id");
    set({ token: null, customerId: null, isLoggedIn: false });
  },

  /** Re-read localStorage after an external write (login page, logout, ...). */
  syncFromStorage: () => set(readSession()),
}));

export default useAuthStore;
