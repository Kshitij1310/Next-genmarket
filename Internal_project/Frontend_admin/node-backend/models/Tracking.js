import mongoose from 'mongoose';

const trackingSchema = new mongoose.Schema({
  shipment_id: { type: String, required: true, unique: true },
  order_id: String,
  status: { type: String, default: 'IN_WAREHOUSE' },
  current_location: String,
  estimated_delivery: Date,
  actual_delivery: Date,
  timeline: [
    {
      status: String,
      location: String,
      timestamp: Date,
      notes: String
    }
  ],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { strict: false });

export const Tracking = mongoose.model('Tracking', trackingSchema, 'tracking');
