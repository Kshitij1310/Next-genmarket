import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User, Eye, EyeOff } from "lucide-react";

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim(),
          password,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      if (!res.ok) {
        alert(data.detail || "Signup failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("customer_id", data.customer_id);

      navigate("/products");
    } catch (err) {
      console.error("Signup error:", err);
      alert("Signup failed. Server error.");
    }

    setLoading(false);
  };

  return (
    <div className="auth-shell min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="auth-card w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-lg p-8">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="brand-mark w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
            N
          </div>
          <span className="text-gray-900 text-xl font-semibold">NexChain</span>
        </div>

        <h1 className="auth-title text-2xl font-semibold text-center text-gray-900 mb-2">
          Create Account
        </h1>

        <p className="text-center text-gray-500 text-sm mb-6">
          Sign up to start using your dashboard
        </p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="form-label text-sm text-gray-600">Name</label>
            <div className="flex items-center mt-1 bg-white border border-gray-200 rounded-xl px-3">
              <User size={16} className="text-gray-400" />
              <input
                type="text"
                placeholder="Your name"
                className="form-input w-full bg-transparent outline-none px-2 py-3 text-gray-800 placeholder-gray-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="form-label text-sm text-gray-600">Email</label>
            <div className="flex items-center mt-1 bg-white border border-gray-200 rounded-xl px-3">
              <Mail size={16} className="text-gray-400" />
              <input
                type="email"
                placeholder="you@example.com"
                className="form-input w-full bg-transparent outline-none px-2 py-3 text-gray-800 placeholder-gray-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label text-sm text-gray-600">Password</label>
            <div className="flex items-center mt-1 bg-white border border-gray-200 rounded-xl px-3">
              <Lock size={16} className="text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                className="form-input w-full bg-transparent outline-none px-2 py-3 text-gray-800 placeholder-gray-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3 rounded-xl font-medium text-white flex items-center justify-center"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <span
            onClick={() => navigate("/login")}
            className="auth-link text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
}
