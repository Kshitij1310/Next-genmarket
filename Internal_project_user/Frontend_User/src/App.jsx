import { Suspense, lazy, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import RouteFallback from "./components/RouteFallback";
import { useUiStore } from "./store/uiStore";

// Every route is code-split: the initial load only pays for the shell plus the
// screen actually being visited.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Cart = lazy(() => import("./pages/Cart"));
const Tracking = lazy(() => import("./pages/Tracking"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Payments = lazy(() => import("./pages/Payments"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Order = lazy(() => import("./pages/Order"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const Settings = lazy(() => import("./pages/Settings"));

function isTokenValid(token) {
  if (!token) return false;

  try {
    const [, payload] = token.split(".");
    const decoded = JSON.parse(atob(payload));
    const exp = decoded?.exp ? decoded.exp * 1000 : null;
    const now = Date.now();

    if (!exp || Number.isNaN(exp)) return false;
    return exp > now;
  } catch (err) {
    console.error("JWT decode failed", err);
    return false;
  }
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";

  const canProceed = useMemo(() => isLoggedIn && isTokenValid(token), [isLoggedIn, token]);

  if (!canProceed) {
    localStorage.removeItem("token");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("customer_id");
    localStorage.removeItem("cart_id");
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppLayout() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="admin-shell flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="admin-main flex-1 flex flex-col overflow-hidden">
        {/* Navbar */}
        <Navbar />

        {/* Page Content */}
        <main className="app-content flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 via-slate-100 to-blue-50/70">
          <div className="page-container">
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 2800,
                style: {
                  background: "#111827",
                  color: "#f9fafb",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  boxShadow:
                    "0 10px 25px rgba(0,0,0,0.2), 0 4px 6px rgba(0,0,0,0.15)",
                },
              }}
            />
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Redirect root to products */}
              <Route path="/" element={<Navigate to="/products" replace />} />

              <Route path="/products" element={<Products />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/tracking" element={<Tracking />} />
              <Route path="/ai-chat" element={<AIChat />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/orders" element={<Order />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Login pages */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected App Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
