import express from 'express';
import { Product } from '../models/Product.js';

const router = express.Router();

// Get products with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.page_size) || 20;
    const skip = (page - 1) * pageSize;
    
    const products = await Product.find().skip(skip).limit(pageSize);
    const total = await Product.countDocuments();
    
    res.json({
      data: products,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Get product by SKU
router.get('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await Product.findOne({ sku });
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching product', error: error.message });
  }
});

export default router;
