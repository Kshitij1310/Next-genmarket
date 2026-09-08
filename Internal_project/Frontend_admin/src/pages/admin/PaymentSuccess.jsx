import PageContainer from '../../components/common/PageContainer';
const PaymentSuccess = () => {
  return (
    <PageContainer className="flex items-center justify-center bg-slate-50">
      <div className="surface-card bg-white shadow-xl rounded-xl p-8 max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Payment Gateway</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 mb-2">Payment Successful</h2>
        <p className="text-slate-600">
          Your Stripe test payment was completed. You can close this page or return to the dashboard.
        </p>
      </div>
    </PageContainer>
  );
};

export default PaymentSuccess;
