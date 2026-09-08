import React from 'react';

const StripePaymentIdModal = ({
  open,
  customerId,
  paymentId,
  onChangePaymentId,
  onContinue,
  onCancel,
  loading = false,
}) => {
  if (!open) return null;

  return (
    <div className="payment-modal-backdrop">
      <div className="payment-modal">
        <h3 className="payment-modal-title">Stripe Payment</h3>
        <p className="payment-modal-subtitle">Please enter your Stripe Payment ID</p>

        <label className="payment-modal-label">Customer ID</label>
        <input
          className="payment-modal-input"
          value={customerId}
          readOnly
        />

        <label className="payment-modal-label">Stripe Payment ID</label>
        <input
          className="payment-modal-input"
          placeholder="pi_test_123456"
          value={paymentId}
          onChange={(e) => onChangePaymentId(e.target.value)}
        />

        <div className="payment-modal-actions">
          <button type="button" className="pay-btn" onClick={onContinue} disabled={loading}>
            {loading ? 'Processing...' : 'Continue'}
          </button>
          <button type="button" className="payment-modal-cancel" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default StripePaymentIdModal;
