import express from 'express';
import { Tracking } from '../models/Tracking.js';

const router = express.Router();

// Get tracking by shipment ID
router.get('/:shipmentId', async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const tracking = await Tracking.findOne({ shipment_id: shipmentId });
    
    if (!tracking) {
      return res.status(404).json({ message: 'Tracking information not found' });
    }
    
    res.json(tracking);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tracking', error: error.message });
  }
});

// Get all tracking records
router.get('/', async (req, res) => {
  try {
    const trackings = await Tracking.find().sort({ created_at: -1 });
    res.json(trackings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tracking records', error: error.message });
  }
});

export default router;
