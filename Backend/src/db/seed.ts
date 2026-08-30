import { pool } from './connection.js';
import { randomUUID } from 'crypto';

async function seed() {
  const merchantId = randomUUID();
  const productId = randomUUID();

  try {
    // 1. Insert a merchant
  /*  await pool.query(
      `INSERT INTO merchants (id, name, email, razorpay_account_id) VALUES (?, ?, ?, ?)`,
      [merchantId, 'Apex Electronics Test Store', 'apex@test.com', 'acc_test_123']
    );
    console.log('Merchant created:', merchantId);

    // 2. Insert a product
    await pool.query(
      `INSERT INTO products (id, merchant_id, sku, name, msrp, base_cost) VALUES (?, ?, ?, ?, ?, ?)`,
      [productId, merchantId, 'LAPTOP-PRO-15', 'Laptop Pro 15"', 74000.00, 55000.00]
    );
    console.log('Product created:', productId);

    // 3. Insert inventory for that product (deliberately LOW so the agent has to trigger procurement)
    await pool.query(
      `INSERT INTO inventory (id, product_id, quantity_available, quantity_reserved) VALUES (?, ?, ?, ?)`,
      [randomUUID(), productId, 4, 0]
    );
    console.log('Inventory created: 4 units available');
*/
    // 4. Insert a policy for this merchant
    await pool.query(
      `INSERT INTO policies (id, merchant_id, min_gross_margin_percent, max_autonomous_spend_inr, max_discount_percent) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), '2072a4bd-6af4-4050-b9fd-6746c342492d ', 15.00, 50000.00, 10.00]
    );
    console.log('Policy created: min margin 15%, max spend ₹50,000, max discount 10%');

    console.log('\nSeed complete. Save these IDs:');
    console.log('merchantId:', merchantId);
    console.log('productId:', productId);
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    await pool.end();
  }
}

seed();