import express from 'express';
import { Order } from '../models/Order.js';
import crypto from 'crypto';

const router = express.Router();

// Create a new order
router.post('/', async (req, res) => {
  try {
    const { sku, quantity } = req.body;
    
    if (!sku || !quantity) {
      return res.status(400).json({ message: 'SKU and quantity are required' });
    }
    
    const order_id = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const shipment_id = `SHIP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    
    const order = new Order({
      order_id,
      sku,
      quantity,
      status: 'PENDING',
      shipment_id,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    await order.save();
    
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error creating order', error: error.message });
  }
});

// Get order by ID
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ order_id: orderId });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching order', error: error.message });
  }
});

// Get all orders
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ created_at: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
});

export default router;
