import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  CheckCircle,
  Clock3,
  CreditCard,
  Globe2,
  RefreshCw,
  Search,
  Smartphone,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { orderService } from '../../services/orderService.js';
import PageContainer from '../../components/common/PageContainer';

const statusToneMap = {
  confirmed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  paid: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  processing: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
};

const StatusBadge = ({ status }) => {
  if (!status) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Unknown</span>;
  }
  const tone = statusToneMap[status.toLowerCase()] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${tone}`}>
      {label}
    </span>
  );
};

const deliveryToneMap = {
  delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  shipped: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  processing: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  cancelled: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
};

const DeliveryBadge = ({ status }) => {
  if (!status) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">—</span>;
  }
  const tone = deliveryToneMap[status.toLowerCase()] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${tone}`}>
      {status}
    </span>
  );
};

const PaymentFilters = ({
  searchValue,
  onSearchChange,
  onReset,
  onSubmit,
}) => (
  <div className="filter-bar flex flex-col gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-center">
    <form className="relative flex-1" onSubmit={onSubmit}>
      <label htmlFor="payment-search" className="sr-only">
        Search by Order ID
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id="payment-search"
        type="search"
        placeholder="Search by Order ID"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        className="form-input w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 transition focus:border-blue-500 focus:bg-white focus:outline-none"
        autoComplete="off"
      />
      <button
        type="submit"
        className="sr-only"
        aria-label="Search order payments"
      />
    </form>
    <div className="flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={onReset}
        className="btn btn-outline inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        <RefreshCw className="h-4 w-4" />
        Reset
      </button>
    </div>
  </div>
);

const formatCurrency = (amount, currency = 'USD') => {
  if (amount === undefined || amount === null) return '—';
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(numericAmount);
  } catch (error) {
    return `${currency || 'USD'} ${numericAmount.toFixed(2)}`;
  }
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const resolveTransactionId = (payment) => {
  const method = (payment.paymentMethod || '').toLowerCase();
  if (method === 'stripe' && payment.stripePaymentId) {
    return payment.stripePaymentId;
  }
  if ((method === 'crypto' || method === 'eth' || method === 'matic') && payment.txHash) {
    return payment.txHash;
  }
  return payment.stripePaymentId || payment.txHash || '—';
};

const getValue = (obj, keys, fallback = '—') => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const resolveProductName = (order) => {
  if (order?.product?.name) return order.product.name;
  if (order?.product?.title) return order.product.title;
  if (order?.items && Array.isArray(order.items) && order.items[0]?.name) return order.items[0].name;
  if (order?.items && Array.isArray(order.items) && order.items[0]?.product_name) return order.items[0].product_name;
  return getValue(order, ['product_name', 'productName', 'name', 'title'], '—');
};

const paymentMethodIcon = (method) => {
  const key = (method || '').toLowerCase();
  if (key.includes('upi')) return Smartphone;
  if (key.includes('card')) return CreditCard;
  if (key.includes('net') || key.includes('bank')) return Banknote;
  if (key.includes('cod') || key.includes('cash')) return Wallet;
  if (key.includes('stripe')) return CreditCard;
  return Globe2;
};

const PaymentRow = ({ payment }) => (
  <tr className="border-b border-slate-100 text-sm text-slate-700 transition hover:bg-slate-50">
    <td data-label="Order / Product" className="px-6 py-4">
      <div className="font-semibold text-slate-900">{payment.orderId}</div>
      <div className="text-xs text-slate-500 mt-0.5">{payment.productName}</div>
    </td>
    <td data-label="Customer" className="px-6 py-4 text-slate-900">{payment.customerName || '—'}</td>
    <td data-label="Payment Method" className="px-6 py-4 capitalize">
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
        {(() => {
          const Icon = paymentMethodIcon(payment.paymentMethod);
          return <Icon className="h-4 w-4 text-slate-500" />;
        })()}
        <span>{payment.paymentMethod || '—'}</span>
      </div>
    </td>
    <td data-label="Payment Status" className="px-6 py-4">
      <StatusBadge status={payment.paymentStatus} />
    </td>
    <td data-label="Transaction ID" className="px-6 py-4 font-mono text-xs text-slate-500">{resolveTransactionId(payment)}</td>
    <td data-label="Amount" className="px-6 py-4 font-semibold text-slate-900 text-right">{formatCurrency(payment.amount, payment.currency)}</td>
    <td data-label="Payment Date & Time" className="px-6 py-4 text-slate-500">
      <div className="font-medium text-slate-800">
        {payment.paymentDate
          ? new Date(payment.paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </div>
      <div className="text-xs text-slate-500">
        {payment.paymentDate
          ? new Date(payment.paymentDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : '—'}
      </div>
    </td>
    <td data-label="Delivery Status" className="px-6 py-4">
      <DeliveryBadge status={payment.deliveryStatus} />
    </td>
  </tr>
);

const PaymentTable = ({ payments, emptyMessage }) => (
  <div className="table-shell overflow-x-auto">
    <table className="market-table min-w-full divide-y divide-slate-100">
      <thead>
        <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          {[
            'Order / Product',
            'Customer',
            'Payment Method',
            'Payment Status',
            'Transaction ID',
            'Amount Paid',
            'Payment Date & Time',
            'Delivery Status',
          ].map((column) => (
            <th
              key={column}
              className={`px-6 py-3 ${column === 'Amount Paid' ? 'text-right' : ''}`}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {payments.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">
              {emptyMessage || 'No payment records available'}
            </td>
          </tr>
        ) : (
          payments.map((payment) => <PaymentRow key={payment.orderId} payment={payment} />)
        )}
      </tbody>
    </table>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-3 p-6">
    {[...Array(3)].map((_, index) => (
      <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
    ))}
  </div>
);

const ErrorBanner = ({ message }) => (
  <div className="mx-6 mt-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
    {message}
  </div>
);

const PaymentMonitoringPage = () => {
  const [searchValue, setSearchValue] = useState('');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emptyMessage, setEmptyMessage] = useState('No payment records available');
  const navigate = useNavigate();

  const resetFilters = () => {
    setSearchValue('');
    setPayments([]);
    setEmptyMessage('No payment records available');
    setErrorMessage('');
  };

  const clearTable = useCallback(() => {
    setPayments([]);
  }, []);

  const fetchOrderById = useCallback(
    async (orderId) => {
      const trimmed = orderId.trim();
      if (!trimmed) {
        setErrorMessage('');
        setEmptyMessage('No payment records available');
        clearTable();
        return;
      }

      try {
        setLoading(true);
        setErrorMessage('');
        setEmptyMessage('');
        clearTable();

        const order = await orderService.getOrderById(trimmed);
        setPayments([
          {
            orderId: order.order_id,
            paymentMethod: order.payment_method,
            paymentStatus: order.payment_status,
            stripePaymentId: order.stripe_payment_id,
            txHash: order.tx_hash,
            amount: order.amount ?? order.total_amount,
            currency: order.currency,
            createdAt: order.created_at,
            paymentDate: order.payment_date || order.paid_at || order.created_at,
            customerName:
              order.customer_name ||
              order.customerName ||
              order.name ||
              order?.customer?.name ||
              '—',
            deliveryStatus: order.delivery_status || order.shipping_status || order.status || '',
            productName: resolveProductName(order),
          },
        ]);
      } catch (error) {
        clearTable();
        if (error?.status === 401) {
          setErrorMessage('Session expired. Please login again.');
          navigate('/login', { replace: true });
          return;
        }
        if (error?.status === 404) {
          setEmptyMessage('Order not found.');
          setErrorMessage('');
          return;
        }
        setEmptyMessage('No payment record found for this Order ID');
        setErrorMessage(error?.message || 'Unable to fetch payment data');
      } finally {
        setLoading(false);
      }
    },
    [clearTable, navigate]
  );

  const handleSearch = useCallback(
    (event) => {
      event?.preventDefault();
      fetchOrderById(searchValue);
    },
    [fetchOrderById, searchValue]
  );

const summary = useMemo(() => {
    const totals = payments.reduce(
      (acc, payment) => {
        const status = (payment.paymentStatus || '').toLowerCase();
        if (status === 'paid' || status === 'confirmed' || status === 'completed') {
          acc.paid += 1;
          acc.revenue += Number(payment.amount) || 0;
        } else if (status === 'pending' || status === 'processing') {
          acc.pending += 1;
        } else if (status === 'failed') {
          acc.failed += 1;
        }
        return acc;
      },
      { revenue: 0, paid: 0, pending: 0, failed: 0 }
    );
    return totals;
  }, [payments]);

  return (
    <PageContainer className="bg-slate-50">
      <div className="page-container mx-auto max-w-7xl space-y-6">
        <header className="page-header">
          <p className="text-sm uppercase tracking-wide text-slate-500">Finance</p>
          <h1 className="page-title text-3xl font-semibold text-slate-900">Payment Monitoring</h1>
          <p className="page-subtitle mt-1 text-sm text-slate-600">
            Monitor customer payment transactions and confirmation status.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Revenue"
            value={formatCurrency(summary.revenue || 0, payments[0]?.currency || 'USD')}
            icon={TrendingUp}
            tone="text-emerald-700 bg-emerald-50 border-emerald-100"
          />
          <SummaryCard
            title="Paid Orders"
            value={summary.paid}
            icon={CheckCircle}
            tone="text-emerald-700 bg-emerald-50 border-emerald-100"
          />
          <SummaryCard
            title="Pending Payments"
            value={summary.pending}
            icon={Clock3}
            tone="text-amber-700 bg-amber-50 border-amber-100"
          />
          <SummaryCard
            title="Failed Payments"
            value={summary.failed}
            icon={XCircle}
            tone="text-rose-700 bg-rose-50 border-rose-100"
          />
        </section>

        {errorMessage && <ErrorBanner message={errorMessage} />}

        <section className="surface-card rounded-3xl bg-white shadow-xl">
          <PaymentFilters
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onReset={resetFilters}
            onSubmit={handleSearch}
          />

          {loading ? (
            <LoadingSkeleton />
          ) : (
            <PaymentTable payments={payments} emptyMessage={emptyMessage} />
          )}
        </section>
      </div>
    </PageContainer>
  );
};

export default PaymentMonitoringPage;

function SummaryCard({ title, value, icon: Icon, tone }) {
  return (
    <div className={`surface-card rounded-2xl border ${tone} p-4 flex items-center gap-4`}>
      <div className="h-11 w-11 rounded-xl bg-white/70 border border-white shadow-sm flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
        <span className="text-xl font-bold text-slate-900">{value}</span>
      </div>
    </div>
  );
}
