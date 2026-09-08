import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader } from 'lucide-react';

const formatCurrency = (price, currency) => {
  if (price === undefined || price === null) return '';
  const numericPrice = Number(price);
  const safePrice = Number.isNaN(numericPrice) ? price : numericPrice;

  if (currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(safePrice);
    } catch (error) {
      return `${currency} ${safePrice}`;
    }
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safePrice);
};

export default function ProductDetailModal({
  isOpen,
  product,
  onClose,
  isLoading = false,
  error = null,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const detailRows = useMemo(() => {
    const rows = [];
    if (!product) return rows;

    const addRow = (label, value) => {
      if (value === undefined || value === null || value === '') return;
      rows.push({ label, value });
    };

    addRow('SKU', product?.sku);
    addRow('Brand', product?.brand || product?.attributes?.brand);
    addRow('Category', product?.category);

    if (product?.price !== undefined && product?.price !== null) {
      rows.push({ label: 'Price', value: formatCurrency(product.price, product.currency) });
    }

    addRow('Currency', product?.currency);

    const stockValue = (() => {
      if (product?.stock_available !== undefined) {
        return product.stock_available ? 'In Stock' : 'Out of Stock';
      }
      if (product?.total_stock !== undefined) {
        const qty = Number(product.total_stock);
        return qty > 0 ? `In Stock • ${qty} units` : 'Out of Stock';
      }
      if (product?.stock_status) {
        return product.stock_status;
      }
      return null;
    })();

    addRow('Stock Status', stockValue);

    return rows;
  }, [product]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="product-modal-overlay" onClick={onClose}>
      <div
        className="product-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="product-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className="product-modal-header">
          <p className="product-modal-eyebrow">Product</p>
          <h2 className="product-modal-title">{product?.name || product?.sku || 'Product Details'}</h2>
        </div>

        {isLoading && (
          <div className="product-modal-loading">
            <Loader className="animate-spin text-blue-500" size={28} />
            <span>Loading product details...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="product-modal-error">
            {error}
          </div>
        )}

        <div className="product-modal-grid">
          {detailRows.map((row) => (
            <div key={row.label} className="product-modal-field">
              <p className="label">{row.label}</p>
              <p className="value">{row.value}</p>
            </div>
          ))}
        </div>
        <div className="product-modal-footer">
          <button type="button" className="product-modal-cta" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
