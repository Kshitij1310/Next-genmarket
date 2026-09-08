import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  order_id: { type: String, required: true, unique: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true },
  status: { type: String, default: 'PENDING' },
  shipment_id: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { strict: false });

export const Order = mongoose.model('Order', orderSchema, 'orders');
