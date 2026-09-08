import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const finalizeOrder = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          alert("User not logged in.");
          return;
        }

        const payload = JSON.parse(atob(token.split(".")[1]));
        const customerId = payload.customer_id;

        const stripePaymentId =
          searchParams.get("pi") ||
          searchParams.get("payment_intent") ||
          searchParams.get("session_id");

        if (!stripePaymentId) {
          alert("Stripe payment ID missing.");
          return;
        }

        const cartItems = JSON.parse(localStorage.getItem("cart")) || [];

        if (cartItems.length === 0) {
          alert("Cart is empty.");
          return;
        }

        const response = await fetch("http://127.0.0.1:8000/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customer_id: customerId,
            payment_method: "stripe",
            payment_completed: true,
            stripe_payment_id: stripePaymentId,
            items: cartItems.map((item) => ({
              sku: item.sku,
              quantity: item.quantity || 1,
            })),
          }),
        });

        const data = await response.json();

        console.log("ORDER CREATION RESPONSE:", data);

        if (!response.ok) {
          alert("Failed to create order.");
          return;
        }

        localStorage.removeItem("cart");

        window.location.href = "/orders";

      } catch (error) {
        console.error("Order finalization error:", error);
        alert("Something went wrong.");
      } finally {
        setLoading(false);
      }
    };

    finalizeOrder();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center">

        {/* Success Icon */}
        <div className="flex justify-center mb-4">
          <div className="bg-green-100 text-green-600 p-3 rounded-full">
            <CheckCircle size={32} />
          </div>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Payment Successful
        </h1>

        <p className="text-gray-500 mb-6">
          Your order is being finalized.
        </p>

        {/* Loader */}
        {loading && (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {!loading && (
          <p className="text-gray-500">
            Redirecting to your orders...
          </p>
        )}

      </div>

    </div>
  );
}