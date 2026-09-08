import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Bot, Sparkles, Clock3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { orderService } from '../../services/orderService.js';
import { productService } from '../../services/productService.js';
import PageContainer from '../../components/common/PageContainer';


const CHAT_ENDPOINT = 'http://127.0.0.1:8000/api/chat';

const roleStyles = {
  admin: {
    container: 'items-end',
    bubble: 'bg-blue-600 text-white shadow-md',
    alignment: 'justify-end',
  },
  ai: {
    container: 'items-start',
    bubble: 'bg-slate-100 text-slate-900 shadow-inner',
    alignment: 'justify-start',
  },
};

const quickActions = [
  { label: 'Check inventory status for WH-C', query: 'Show inventory status for warehouse WH-C.' },
  { label: 'Track shipment SHP-12345', query: 'Track shipment SHP-12345 and show its current status.' },
  { label: 'Show latest 5 orders', query: 'Show the latest 5 customer orders.' },
  { label: 'List low stock products', query: 'List products that are currently low in stock.' },
  { label: 'Warehouse stock summary for phones', query: 'Show warehouse stock summary for product category phones.' },
];

const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const AiChat = () => {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const suggestionContainerRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending, scrollToBottom]);

  const extractOrderId = useCallback((text) => {
    if (!text) return null;
    const match = text.toUpperCase().match(/ORD-[A-Z0-9]+/);
    return match ? match[0] : null;
  }, []);

  const formatOrderResponse = useCallback((order, orderId) => {
    const sku = order?.items?.[0]?.sku ?? order?.sku ?? '-';
    const quantity = order?.items?.length
      ? order.items.reduce((sum, item) => sum + (item?.quantity || 0), 0)
      : order?.quantity ?? '-';
    const warehouse = order?.allocated_warehouse ?? order?.warehouse_code ?? '-';
    const shipmentId = order?.shipment_id ?? order?.shipmentId ?? '-';
    const status = order?.status ?? order?.order_status ?? '-';

    return (
      `Order ${orderId} is ${status}.\n` +
      `Product: ${sku}\n` +
      `Quantity: ${quantity}\n` +
      `Warehouse: ${warehouse}\n` +
      `Shipment ID: ${shipmentId}`
    );
  }, []);

  const sendChatMessageToAPI = useCallback(
    async (messageText) => {
      if (!token) {
        const authError = new Error('Session expired. Please login again.');
        authError.status = 401;
        throw authError;
      }

      try {
        const response = await fetch(CHAT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: messageText }),
        });

        const raw = await response.text();
        const contentType = response.headers.get('content-type') || '';
        let data = raw;
        if (contentType.includes('application/json') && raw) {
          try {
            data = JSON.parse(raw);
          } catch (parseError) {
            data = raw;
          }
        }

        if (!response.ok) {
          const apiMessage =
            typeof data === 'object' && data !== null
              ? data.detail || data.message || 'Chat request failed.'
              : raw || 'Chat request failed.';
          const apiError = new Error(apiMessage);
          apiError.status = response.status;
          throw apiError;
        }

        if (typeof data === 'object' && data !== null && data.reply) {
          return data.reply;
        }

        if (typeof data === 'string' && data.trim()) {
          return data.trim();
        }

        return 'I processed the request but no further details were provided.';
      } catch (err) {
        if (err.name === 'TypeError') {
          const networkError = new Error('Unable to connect to server.');
          networkError.status = 0;
          throw networkError;
        }
        throw err;
      }
    },
    [token]
  );

  const runChatFlow = useCallback(
    async (messageText) => {
      const trimmedMessage = (messageText || '').trim();
      if (!trimmedMessage || isSending) return;

      setInputValue('');
      setError(null);

      const newMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-admin`,
        role: 'admin',
        text: trimmedMessage,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, newMessage]);

      try {
        setIsSending(true);
        const orderId = extractOrderId(trimmedMessage);
        let reply;

        // if the user provided an order ID, keep existing logic
        if (/where\s+is\s+my\s+order/i.test(trimmedMessage) && !orderId) {
          reply = 'Please provide your Order ID to check status.';
        } else if (orderId) {
          try {
            const order = await orderService.getOrderById(orderId);
            reply = formatOrderResponse(order, orderId);
          } catch (apiError) {
            if (apiError?.status === 404) {
              reply = `Order ID ${orderId} not found. Please check and try again.`;
            } else if (apiError?.status === 401) {
              throw apiError;
            } else {
              reply = 'Unable to fetch order information. Please try again.';
            }
          }
        } else {
          // check whether the input corresponds to a product name or SKU
          try {
            const prodResp = await productService.getProducts({ search: trimmedMessage, pageSize: 20 });
            const items = prodResp?.items || prodResp?.data || [];
            const q = trimmedMessage.toLowerCase();
            const matching = items.filter((p) => {
              const sku = (p.sku || '').toLowerCase();
              const name = (p.name || '').toLowerCase();
              return sku.includes(q) || name.includes(q);
            });
            if (matching.length > 0) {
              // choose the first truly matching product
              const prod = matching[0];
              reply = prod.description || 'No description available for that product.';
            } else {
              // if no good product match, fall back to AI chat endpoint
              reply = await sendChatMessageToAPI(trimmedMessage);
            }
          } catch (prodErr) {
            // if product API fails, fall back to chat
            reply = await sendChatMessageToAPI(trimmedMessage);
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-ai`,
            role: 'ai',
            text: reply,
            timestamp: Date.now(),
          },
        ]);
      } catch (err) {
        if (err.status === 401) {
          setError('Session expired. Please login again.');
        } else if (err.status === 0) {
          setError('Unable to connect to server.');
        } else {
          setError(err.message || 'Unable to send message.');
        }
      } finally {
        setIsSending(false);
      }
    },
    [extractOrderId, formatOrderResponse, isSending, sendChatMessageToAPI]
  );

  const handleSendMessage = useCallback(
    async (event) => {
      event?.preventDefault();
      if (!inputValue.trim() || isSending) return;
      await runChatFlow(inputValue);
    },
    [inputValue, isSending, runChatFlow]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage(event);
      }
    },
    [handleSendMessage]
  );

  const renderMessage = useCallback((message) => {
    const style = roleStyles[message.role] || roleStyles.ai;
    return (
      <div key={message.id} className={`flex ${style.alignment} py-1`}>
        <div className="flex flex-col max-w-xl gap-1">
          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${style.bubble}`}>
            {message.text}
          </div>
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock3 className="h-3 w-3" /> {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }, []);

  const isSendDisabled = useMemo(() => isSending || !inputValue.trim(), [isSending, inputValue]);

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container mx-auto max-w-5xl space-y-6">
        <div className="page-header">
          <p className="text-sm uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-500" /> Automation
          </p>
          <h1 className="page-title text-3xl font-semibold text-slate-900">AI Operations Assistant</h1>
          <p className="page-subtitle mt-1 text-sm text-slate-600">
            Ask operational questions about orders, shipments, and inventory. Responses stream directly from the backend assistant.
          </p>
        </div>

        {/* Quick suggestions */}
        <div className="surface-card rounded-2xl bg-white shadow-md px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Quick actions
          </div>
          <div className="flex flex-wrap gap-2" ref={suggestionContainerRef}>
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setInputValue(action.query);
                  runChatFlow(action.query);
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card flex flex-col rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between px-6 pt-6">
            <div className="text-xs font-semibold text-green-600">AI Assistant Online</div>
            {isSending && <div className="text-xs text-blue-600 animate-pulse">Processing request...</div>}
          </div>

          <div
            ref={scrollContainerRef}
            className="chat-scroll custom-scrollbar flex-1 space-y-4 overflow-y-auto border-b border-slate-100 p-6"
            style={{ minHeight: '24rem', maxHeight: '32rem' }}
          >
            {messages.length === 0 && !isSending && (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-500 gap-2">
                <p className="text-sm font-semibold text-slate-700">Welcome to AI Operations Assistant</p>
               
                <div className="text-xs text-slate-600 space-y-1">
                 
                </div>
              </div>
            )}

            {messages.map(renderMessage)}

            {isSending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  Assistant is typing...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="px-6 pt-3 text-sm text-red-600">{error}</div>
          )}

          <form className="flex items-center gap-4 p-6" onSubmit={handleSendMessage}>
            <div className="flex-1">
              <label htmlFor="ai-message" className="sr-only">
                Enter message
              </label>
              <textarea
                id="ai-message"
                name="ai-message"
                rows={2}
                className="form-input w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner focus:border-blue-500 focus:bg-white focus:outline-none"
                placeholder="Ask the assistant..."
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isSendDisabled}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </PageContainer>
  );
};

export default AiChat;
