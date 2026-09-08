import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, CreditCard, Wallet, Loader2 } from "lucide-react";
import { BrowserProvider, parseEther, Contract } from "ethers";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries";

const CRYPTO_PAYMENT_ABI = [
  "function payForOrder(bytes32 _orderId, address _seller) external payable",
];

export default function Payments() {
  const [cartItems, setCartItems] = useState([]);
  const [method, setMethod] = useState("stripe");
  const [codSuccess, setCodSuccess] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Crypto state
  const [cryptoData, setCryptoData] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [isCryptoLoading, setIsCryptoLoading] = useState(false);
  const [cryptoStep, setCryptoStep] = useState(""); // "connecting" | "converting" | "signing" | "verifying"

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const customerIdForCache = localStorage.getItem("customer_id");

  /** After a successful payment the server cart and order list both changed. */
  const invalidateCartAndOrders = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.cart(customerIdForCache) });
    queryClient.invalidateQueries({ queryKey: queryKeys.orders(customerIdForCache) });
  };
  const location = useLocation();

  useEffect(() => {
    const stripeInProgress = localStorage.getItem("stripe_in_progress");

    if (stripeInProgress) {
      localStorage.removeItem("stripe_in_progress");
      navigate("/orders?payment=cancel");
      return;
    }

    const fromCart =
      location.state?.fromCart || sessionStorage.getItem("from_cart") === "true";

    if (!fromCart) {
      navigate("/cart");
      return;
    }

    sessionStorage.removeItem("from_cart");

    const fetchCart = async () => {
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("customer_id");

      if (!token || !customerId) return;

      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/${customerId}/cart`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();

        if (!res.ok) {
          console.error(data);
          return;
        }

        setCartItems(data.items || []);
      } catch (err) {
        console.error("Payment cart fetch error:", err);
      }
    };

    fetchCart();
  }, [location, navigate]);

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity || 1),
    0
  );

  // Fetch MATIC conversion when crypto is selected
  useEffect(() => {
    if (method !== "crypto" || totalAmount <= 0) {
      setCryptoData(null);
      return;
    }

    const fetchConversion = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch(
          "http://127.0.0.1:8000/api/payment/crypto/convert",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ amount_usd: totalAmount }),
          }
        );
        const data = await res.json();
        if (res.ok) {
          setCryptoData(data);
        }
      } catch (err) {
        console.error("Conversion fetch error:", err);
      }
    };

    fetchConversion();
  }, [method, totalAmount]);

  // Connect MetaMask wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask is not installed. Please install it to pay with crypto.");
      return null;
    }

    try {
      setCryptoStep("connecting");
      const provider = new BrowserProvider(window.ethereum);

      // Request Polygon Amoy network
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x13882" }], // 80002 in hex
        });
      } catch (switchError) {
        // If chain not added, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x13882",
                chainName: "Polygon Amoy Testnet",
                nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
                rpcUrls: ["https://rpc-amoy.polygon.technology"],
                blockExplorerUrls: ["https://amoy.polygonscan.com"],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }

      const accounts = await provider.send("eth_requestAccounts", []);
      setWalletAddress(accounts[0]);
      setCryptoStep("");
      return { provider, address: accounts[0] };
    } catch (err) {
      console.error("Wallet connection error:", err);
      toast.error("Failed to connect wallet.");
      setCryptoStep("");
      return null;
    }
  };

  // Handle crypto payment via smart contract
  const handleCryptoPayment = async () => {
    const token = localStorage.getItem("token");
    const customerId = localStorage.getItem("customer_id");

    if (!token || !customerId) {
      toast.error("Missing authentication.");
      return;
    }

    if (cartItems.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }

    setIsCryptoLoading(true);

    try {
      // 1. Connect wallet
      const wallet = await connectWallet();
      if (!wallet) {
        setIsCryptoLoading(false);
        return;
      }

      // 2. Initiate payment — get contract details from backend
      setCryptoStep("converting");
      const orderId = `ORD-${Date.now()}`;

      const initiateRes = await fetch(
        "http://127.0.0.1:8000/api/payment/crypto/initiate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            order_id: orderId,
            amount_usd: totalAmount,
            customer_id: customerId,
          }),
        }
      );

      const paymentData = await initiateRes.json();

      if (!initiateRes.ok) {
        toast.error(paymentData?.detail || "Failed to initiate crypto payment.");
        setIsCryptoLoading(false);
        setCryptoStep("");
        return;
      }

      // 3. Send transaction via MetaMask to the smart contract
      setCryptoStep("signing");
      toast("Please confirm the transaction in MetaMask...", { icon: "🦊" });

      const signer = await wallet.provider.getSigner();
      const contract = new Contract(
        paymentData.contract_address,
        CRYPTO_PAYMENT_ABI,
        signer
      );

      // Encode the contract call data
      const txData = await contract.payForOrder.populateTransaction(
        paymentData.order_id_bytes32,
        paymentData.seller_address,
        { value: BigInt(paymentData.amount_wei) }
      );

      // Send directly via MetaMask RPC with forced gas params
      // (BrowserProvider signer lets MetaMask override gas — this bypasses that)
      const minTip = "0x" + (35000000000n).toString(16);   // 35 gwei
      const maxFee = "0x" + (70000000000n).toString(16);   // 70 gwei
      const value = "0x" + BigInt(paymentData.amount_wei).toString(16);

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: paymentData.contract_address,
          data: txData.data,
          value: value,
          maxPriorityFeePerGas: minTip,
          maxFeePerGas: maxFee,
        }],
      });

      const tx = { hash: txHash, wait: async () => {
        // Poll for receipt
        let receipt = null;
        while (!receipt) {
          receipt = await wallet.provider.getTransactionReceipt(txHash);
          if (!receipt) await new Promise(r => setTimeout(r, 3000));
        }
        return receipt;
      }};

      toast("Transaction sent! Waiting for confirmation...", { icon: "⏳" });
      setCryptoStep("verifying");

      // 4. Wait for transaction confirmation
      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        toast.error("Transaction failed on-chain.");
        setIsCryptoLoading(false);
        setCryptoStep("");
        return;
      }

      // 5. Verify on backend and auto-record
      await fetch("http://127.0.0.1:8000/api/payment/crypto/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tx_hash: txHash,
          order_id: orderId,
          customer_id: customerId,
        }),
      });

      // 6. Create the order
      const orderRes = await fetch("http://127.0.0.1:8000/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_id: customerId,
          payment_method: "matic",
          payment_completed: true,
          tx_hash: txHash,
          items: cartItems.map((item) => ({
            sku: item.sku,
            quantity: item.quantity || 1,
          })),
        }),
      });

      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        toast.error(orderData?.detail || "Order creation failed after payment.");
        setIsCryptoLoading(false);
        setCryptoStep("");
        return;
      }

      // 7. Success — clear cart and redirect
      localStorage.removeItem("cart");
      invalidateCartAndOrders();

      toast.success("Payment confirmed on Polygon Amoy!");
      setCryptoStep("");

      // Save tx details for the success page
      localStorage.setItem(
        "crypto_payment",
        JSON.stringify({
          tx_hash: txHash,
          amount_matic: paymentData.amount_matic,
          amount_usd: totalAmount,
          order_id: orderData.order_id || orderId,
        })
      );

      navigate(`/orders?payment=success&tx=${txHash}`);
    } catch (err) {
      console.error("Crypto payment error:", err);
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        toast.error("Transaction rejected by user.");
      } else {
        toast.error(err?.shortMessage || err?.message || "Crypto payment failed.");
      }
      setIsCryptoLoading(false);
      setCryptoStep("");
    }
  };

  const handlePayment = async () => {
    try {
      const token = localStorage.getItem("token");
      const customerId = localStorage.getItem("customer_id");

      if (!token || !customerId) {
        toast.error("Missing authentication.");
        return;
      }

      if (method === "stripe") {
        const res = await fetch(
          `http://127.0.0.1:8000/api/${customerId}/cart/payment-session`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();

        if (!res.ok || !data.checkout_url) {
          toast.error("Stripe session creation failed.");
          return;
        }

        localStorage.setItem("stripe_in_progress", "true");

        window.location.href = data.checkout_url;
        return;
      }

      if (method === "crypto") {
        await handleCryptoPayment();
        return;
      }

      if (method === "cod") {
        if (cartItems.length === 0) {
          toast.error("Your cart is empty.");
          return;
        }

        setIsPlacingOrder(true);

        const res = await fetch("http://127.0.0.1:8000/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customer_id: customerId,
            payment_method: "cash_on_delivery",
            payment_completed: false,
            payment_status: "pending",
            status: "confirmed",
            items: cartItems.map((item) => ({
              sku: item.sku,
              quantity: item.quantity || 1,
            })),
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data?.detail || data?.message || "Failed to place order.");
          setIsPlacingOrder(false);
          return;
        }

        localStorage.removeItem("cart");
        invalidateCartAndOrders();

        setCodSuccess(true);

        setTimeout(() => {
          navigate("/orders");
        }, 1200);
        return;
      }

    } catch (err) {
      console.error("Checkout failed:", err);
      toast.error("Checkout failed.");
      setIsPlacingOrder(false);
    }
  };

  const getCryptoStepLabel = () => {
    switch (cryptoStep) {
      case "connecting": return "Connecting wallet...";
      case "converting": return "Preparing payment...";
      case "signing": return "Confirm in MetaMask...";
      case "verifying": return "Verifying on-chain...";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* HEADER WITH BACK BUTTON */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center gap-3">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">
            Payments
          </h1>
        </div>

      </div>

      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6">

        {/* ORDER SUMMARY */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Order Summary
          </h2>

          <div className="space-y-3">

            {cartItems.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
                Your cart is empty.
              </div>
            )}

            {cartItems.map((item) => (
              <div
                key={item.sku}
                className="flex justify-between text-gray-700"
              >
                <span>{item.name}</span>

                <span>
                  {item.currency} {Number(item.price).toFixed(2)} x{" "}
                  {Number(item.quantity || 1)}
                </span>
              </div>
            ))}

          </div>

          <div className="border-t border-gray-200 mt-6 pt-6 flex justify-between text-gray-900 text-lg font-semibold">

            <span>Total</span>

            <span>USD {totalAmount.toFixed(2)}</span>

          </div>

          {/* MATIC conversion display */}
          {method === "crypto" && cryptoData && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
              <div className="flex justify-between text-purple-800 font-medium">
                <span>MATIC Equivalent</span>
                <span>{cryptoData.amount_matic.toFixed(4)} MATIC</span>
              </div>
              <div className="flex justify-between text-purple-600 text-sm mt-1">
                <span>Rate</span>
                <span>1 MATIC = ${cryptoData.rate}</span>
              </div>
              <div className="text-purple-500 text-xs mt-1">
                Network: Polygon Amoy Testnet
              </div>
            </div>
          )}

          {/* Connected wallet display */}
          {method === "crypto" && walletAddress && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-2 text-green-800 text-sm">
                <Wallet size={14} />
                <span className="font-medium">Wallet Connected</span>
              </div>
              <div className="text-green-600 text-xs mt-1 font-mono truncate">
                {walletAddress}
              </div>
            </div>
          )}

        </div>

        {/* PAYMENT METHODS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">

          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Select Payment Method
          </h2>

          <div className="space-y-4">

            {/* STRIPE */}
            <div
              onClick={() => setMethod("stripe")}
              className={`p-4 rounded-xl border cursor-pointer flex items-center transition ${
                method === "stripe"
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-blue-400"
              }`}
            >
              <input
                type="radio"
                checked={method === "stripe"}
                readOnly
                className="mr-3"
              />

              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-blue-600" />
                <span className="text-gray-900 font-medium">
                  Stripe Payment
                </span>
              </div>
            </div>

            {/* CRYPTO */}
            <div
              onClick={() => setMethod("crypto")}
              className={`p-4 rounded-xl border cursor-pointer flex items-center transition ${
                method === "crypto"
                  ? "border-purple-600 bg-purple-50"
                  : "border-gray-200 hover:border-purple-400"
              }`}
            >
              <input
                type="radio"
                checked={method === "crypto"}
                readOnly
                className="mr-3"
              />

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-purple-600" />
                  <span className="text-gray-900 font-medium">
                    Pay with MATIC
                  </span>
                </div>
                {method === "crypto" && (
                  <p className="text-xs text-purple-600 mt-1 ml-6">
                    Polygon Amoy Testnet via MetaMask
                  </p>
                )}
              </div>
            </div>

            {/* COD */}
            <div
              onClick={() => setMethod("cod")}
              className={`p-4 rounded-xl border cursor-pointer flex items-center transition ${
                method === "cod"
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-blue-400"
              }`}
            >
              <input
                type="radio"
                checked={method === "cod"}
                readOnly
                className="mr-3"
              />

              <span className="text-gray-900 font-medium">
                Cash on Delivery
              </span>
            </div>

          </div>

          {/* PAY BUTTON */}
          <button
            onClick={handlePayment}
            disabled={isPlacingOrder || isCryptoLoading}
            className={`w-full mt-8 transition text-white py-3 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 ${
              method === "crypto"
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-blue-600 hover:bg-blue-700"
            } disabled:opacity-60`}
          >
            {(isPlacingOrder || isCryptoLoading) && (
              <Loader2 size={20} className="animate-spin" />
            )}

            {isCryptoLoading
              ? getCryptoStepLabel()
              : isPlacingOrder
                ? "Placing Order..."
                : method === "crypto"
                  ? `Pay ${cryptoData ? cryptoData.amount_matic.toFixed(4) + " MATIC" : "with MATIC"}`
                  : `Pay USD ${totalAmount.toFixed(2)}`
            }
          </button>

        </div>

      </div>

      {codSuccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Order Confirmed
            </h3>
            <p className="text-gray-600">
              Your order has been successfully placed with Cash on Delivery.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
