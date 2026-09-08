import { useState } from "react";
import { Bot, Send, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AIChat() {
  const navigate = useNavigate();

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      type: "bot",
      text: "Hi, I’m NexBot. I can help with orders, shipments, products, and pricing instantly.",
      intent: "general_support",
      confidence: 1,
    },
  ]);
  const [loading, setLoading] = useState(false);

  const fetchProductInfo = async (query, token) => {
    try {
      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!searchRes.ok) return { matched: false };

      const searchData = await searchRes.json();
      const top = searchData?.results?.[0];
      const score = top?.relevance_score ?? 0;

      if (!top || score < 0.7 || !top.product?.sku) {
        return { matched: false };
      }

      const detailRes = await fetch(`/api/products/${top.product.sku}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!detailRes.ok) return { matched: false };

      const detail = await detailRes.json();

      return {
        matched: true,
        text: detail.description || "Product description not available.",
        intent: "product_info",
        confidence: 0.95,
      };
    } catch (err) {
      console.error("Product lookup error:", err);
      return { matched: false };
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    const userMessage = message.trim();

    setMessages((prev) => [...prev, { type: "user", text: userMessage }]);
    setMessage("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("customer_id");

      let responseText = "";
      let intent = "general_support";
      let confidence = 1;

      const shipmentMatch = userMessage.match(/SHP-[A-Z0-9]+/i);
      const orderMatch = userMessage.match(/ORD-[A-Z0-9]+/i);

      if (shipmentMatch) {
        const shipmentId = shipmentMatch[0];

        const res = await fetch(`/api/${customerId}/shipments/${shipmentId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          responseText = "Shipment not found.";
        } else {
          const data = await res.json();
          const status = data.status?.toLowerCase();

          if (status === "preparing") {
            responseText = `Shipment ${shipmentId} is currently Preparing.`;
          } else if (status === "in-transit") {
            responseText = `Shipment ${shipmentId} is In-Transit.`;
          } else if (status === "delivered") {
            responseText = `Shipment ${shipmentId} has been Delivered.`;
          } else {
            responseText = `Shipment ${shipmentId} status: ${data.status}`;
          }
        }

        intent = "shipment_tracking";
        confidence = 0.98;
      }

      else if (orderMatch) {
        const orderId = orderMatch[0];

        const res = await fetch(`/api/${customerId}/orders/${orderId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          responseText = "Order not found.";
        } else {
          const data = await res.json();
          const status = data.status?.toLowerCase();
          responseText = `Order ${orderId} status: ${status}`;
        }

        intent = "order_tracking";
        confidence = 0.96;
      }

      else {
        const productInfo = await fetchProductInfo(userMessage, token);

        if (productInfo.matched) {
          responseText = productInfo.text;
          intent = productInfo.intent;
          confidence = productInfo.confidence;
        }
      }

      if (!responseText) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: userMessage }),
        });

        const data = await res.json();

        if (!res.ok) {
          responseText = "Something went wrong.";
        } else {
          responseText = data.reply || "I'm here to help!";
          intent = data.intent || "general_support";
          confidence = data.confidence || 0.9;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          text: responseText,
          intent,
          confidence,
        },
      ]);
    } catch (err) {
      console.error(err);

      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          text: "Server error. Please try again.",
          intent: "error",
          confidence: 1,
        },
      ]);
    }

    setLoading(false);
  };

  const renderBotContent = (msg) => {
    return <p className="text-sm whitespace-pre-wrap">{msg.text}</p>;
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div>
          <h1 className="text-2xl font-semibold text-gray-900">NexBot</h1>
          <p className="text-sm text-slate-500">Futuristic support assistant for smart supply operations</p>
        </div>

      </div>

      {/* Chat Container */}
      <div className="flex-1 bg-white/90 backdrop-blur border border-blue-100 rounded-2xl shadow-[0_20px_60px_rgba(37,99,235,0.12)] p-6 flex flex-col">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`max-w-3xl p-4 rounded-2xl ${
                msg.type === "user"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white ml-auto shadow-md"
                  : "bg-white border border-blue-100 text-gray-800 shadow-sm"
              }`}
            >

              {msg.type === "bot" && (
                <div className="flex items-center gap-2 mb-2">

                  <div className="h-7 w-7 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                    <Bot size={14} className="text-white" />
                  </div>

                  <span className="text-xs text-slate-500 uppercase tracking-wide">
                    NexBot • {msg.intent} ({Math.round(msg.confidence * 100)}%)
                  </span>

                </div>
              )}

              {msg.type === "bot"
                ? renderBotContent(msg)
                : <p className="text-sm">{msg.text}</p>}

            </div>
          ))}

          {loading && (
            <div className="bg-white border border-blue-100 p-4 rounded-xl max-w-3xl shadow-sm">
              <p className="text-blue-600 text-sm">NexBot is thinking...</p>
            </div>
          )}

        </div>

        {/* Input Bar */}
        <div className="mt-6 flex items-center border border-blue-100 bg-white rounded-xl px-4 py-3 shadow-sm">

          <input
            type="text"
            placeholder="Ask about order status, shipment ID..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400"
          />

          <button
            onClick={handleSend}
            className="ml-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 p-2 rounded-lg transition shadow"
          >
            <Send size={16} className="text-white" />
          </button>

        </div>

      </div>

    </div>
  );
}
