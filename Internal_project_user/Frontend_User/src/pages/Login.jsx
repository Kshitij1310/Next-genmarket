import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function Login() {
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    const token = localStorage.getItem("token");
    if (isLoggedIn && token) navigate("/products");
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        alert(data.detail || "Invalid email or password");
        setLoading(false);
        return;
      }

      // Writes localStorage and updates the store in one step, so the shell
      // (navbar, notification socket) sees the new session immediately.
      setSession({ token: data.access_token, customerId: data.customer_id });
      navigate("/products");
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed. Server error.");
    }

    setLoading(false);
  };

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      <div className="auth-card w-full max-w-md rounded-xl bg-white shadow-lg border border-slate-200">
        <div className="px-8 py-10">
          <div className="text-center">
            <p className="auth-brand text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">
              NexChain
            </p>
            <h1 className="auth-title mt-3 text-3xl font-bold text-slate-900">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-600">Sign in to access your workspace</p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div>
              <label className="form-label block text-sm font-medium text-slate-700">Email</label>
              <div className="mt-1.5 flex items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition">
                <Mail size={16} className="text-slate-400" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="form-input w-full bg-transparent px-2 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label block text-sm font-medium text-slate-700">Password</label>
              <div className="mt-1.5 flex items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition">
                <Lock size={16} className="text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  className="form-input w-full bg-transparent px-2 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don't have an account?{" "}
            <Link to="/signup" className="auth-link font-medium text-blue-600 hover:text-blue-700">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
