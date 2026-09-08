import { create } from "zustand";

const readTheme = () => (localStorage.getItem("theme") === "dark" ? "dark" : "light");

/** Cross-page UI state: theme and the cart badge count. */
export const useUiStore = create((set) => ({
  theme: readTheme(),
  cartCount: 0,

  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),

  setCartCount: (cartCount) => set({ cartCount: Number(cartCount) || 0 }),
}));

export default useUiStore;
