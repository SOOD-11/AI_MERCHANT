import { query } from '../db/connection.js';

export interface ProductInventoryRecord {
  productId: string;
  sku: string;
  name: string;
  msrp: number;
  baseCost: number;
  quantityAvailable: number;
  quantityReserved: number;
}

export const InventoryService = {
  getProductBySku: async (sku: string): Promise<ProductInventoryRecord | null> => {
    const rows = (await query(
      `SELECT 
        p.id AS productId,
        p.sku,
        p.name,
        p.msrp,
        p.base_cost AS baseCost,
        i.quantity_available AS quantityAvailable,
        i.quantity_reserved AS quantityReserved 
      FROM products p 
      JOIN inventory i ON p.id = i.product_id 
      WHERE p.sku = ? 
      LIMIT 1`,
      [sku]
    )) as ProductInventoryRecord[];

    if (!rows || rows.length === 0) return null;
    const r = rows[0];

    return {
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      msrp: Number(r.msrp),
      baseCost: Number(r.baseCost),
      quantityAvailable: Number(r.quantityAvailable),
      quantityReserved: Number(r.quantityReserved),
    };
  },

  /**
   * Phase 1: Hold stock during deal acceptance / payment link creation
   * Decrements available and increments reserved atomically.
   */
  reserveStock: async (productId: string, quantity: number): Promise<boolean> => {
    const result: any = await query(
      `UPDATE inventory 
       SET quantity_available = quantity_available - ?, 
           quantity_reserved = quantity_reserved + ? 
       WHERE product_id = ? AND quantity_available >= ?`,
      [quantity, quantity, productId, quantity]
    );

    return (result?.affectedRows ?? 0) > 0;
  },

  /**
   * Phase 2: Called by Webhook upon successful payment
   * Consumes reserved stock without touching available stock.
   */
  finalizeDeduction: async (productId: string, quantity: number): Promise<void> => {
    await query(
      `UPDATE inventory 
       SET quantity_reserved = GREATEST(0, quantity_reserved - ?) 
       WHERE product_id = ?`,
      [quantity, productId]
    );
  },

  /**
   * Rollback: Called if payment link expires, fails, or is cancelled
   * Moves reserved items back to available stock.
   */
  releaseReservation: async (productId: string, quantity: number): Promise<void> => {
    await query(
      `UPDATE inventory 
       SET quantity_available = quantity_available + ?,
           quantity_reserved = GREATEST(0, quantity_reserved - ?) 
       WHERE product_id = ?`,
      [quantity, quantity, productId]
    );
  },
};