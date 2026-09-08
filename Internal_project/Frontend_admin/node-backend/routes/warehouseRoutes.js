import express from 'express';
import { Warehouse } from '../models/Warehouse.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const warehouses = await Warehouse.find();
    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching warehouses', error: error.message });
  }
});

export default router;
