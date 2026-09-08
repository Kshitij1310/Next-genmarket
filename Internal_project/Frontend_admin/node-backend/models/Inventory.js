import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({}, { strict: false });

export const Inventory = mongoose.model('Inventory', inventorySchema, 'warehouses');
