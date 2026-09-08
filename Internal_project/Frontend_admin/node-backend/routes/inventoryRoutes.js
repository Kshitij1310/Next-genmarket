import express from 'express';
import { Inventory } from '../models/Inventory.js';

const router = express.Router();

// Get all inventory (warehouses)
router.get('/', async (req, res) => {
  try {
    const inventory = await Inventory.find();
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching inventory', error: error.message });
  }
});

// Get all warehouses (alias for /)
router.get('/warehouses', async (req, res) => {
  try {
    const warehouses = await Inventory.find();
    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching warehouses', error: error.message });
  }
});

// Get inventory by warehouse code
router.get('/warehouse/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const warehouse = await Inventory.findOne({ code: code });
    
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }
    
    res.json(warehouse);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching warehouse inventory', error: error.message });
  }
});

// Get products in a warehouse
router.get('/warehouse/:code/products', async (req, res) => {
  try {
    const { code } = req.params;
    const warehouse = await Inventory.findOne({ code: code });
    
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }
    
    // Return the products array from the warehouse
    const products = warehouse.products || [];
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching warehouse products', error: error.message });
  }
});

// Get inventory by SKU across all warehouses
router.get('/sku/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const warehouses = await Inventory.find({ 'products.sku': sku });
    
    const inventorySummary = warehouses.map(warehouse => {
      const product = warehouse.products?.find(p => p.sku === sku);
      return {
        warehouse_code: warehouse.code,
        warehouse_name: warehouse.name,
        location: warehouse.location,
        quantity: product?.quantity || 0,
        reorder_point: product?.reorder_point || 0,
        last_restocked: product?.last_restocked,
      };
    });
    
    res.json(inventorySummary);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching SKU inventory', error: error.message });
  }
});

export default router;
