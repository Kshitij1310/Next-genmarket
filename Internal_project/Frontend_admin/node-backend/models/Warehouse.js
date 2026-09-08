import mongoose from 'mongoose';

const warehouseSchema = new mongoose.Schema({}, { strict: false });

export const Warehouse = mongoose.model('Warehouse', warehouseSchema, 'warehouses');
