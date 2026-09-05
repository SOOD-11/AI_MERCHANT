import { randomUUID } from 'crypto';

export interface SupplierPayoutRequest {
  supplierName: string;
  bankAccount: string;
  bankIfsc: string;
  amountInInr: number;
  sku: string;
  quantity: number;
  referenceId: string;
}

export const RazorpayXService = {
  disburseWholesalePayout: async (req: SupplierPayoutRequest) => {
    console.log(`\n💸 [RazorpayX Payout]: Initiating outbound bank payout...`);
    console.log(`🏢 Beneficiary: ${req.supplierName}`);
    console.log(`🏦 A/C: ${req.bankAccount} | IFSC: ${req.bankIfsc}`);
    console.log(`💰 Transfer: ₹${req.amountInInr.toLocaleString('en-IN')}`);

    const keyId = (process.env.RAZORPAYX_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAYX_KEY_SECRET || '').trim();
    const sourceAccount = (process.env.RAZORPAYX_ACCOUNT_NUMBER || '2323230041518725').trim();

    if (!keyId || !keySecret) {
      console.error('❌ Missing RAZORPAYX_KEY_ID or RAZORPAYX_KEY_SECRET in .env!');
      throw new Error('Missing RazorpayX API credentials');
    }

    // Crucial: Use NEFT for transfers >= 5,00,000 INR
    const payoutMode = req.amountInInr >= 500000 ? 'NEFT' : 'IMPS';
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const payload = {
      account_number: sourceAccount,
      amount: Math.round(req.amountInInr * 100), // paise
      currency: 'INR',
      mode: payoutMode,
      purpose: 'vendor bill',
      fund_account: {
        account_type: 'bank_account',
        bank_account: {
          name: req.supplierName,
          ifsc: req.bankIfsc,
          account_number: req.bankAccount,
        },
        contact: {
          name: req.supplierName,
          type: 'vendor',
          reference_id: req.referenceId,
        },
      },
      queue_if_low_balance: true,
      reference_id: req.referenceId,
      narration: `Restock ${req.quantity}x ${req.sku.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 30),
    };

    console.log(`📡 [RazorpayX] Sending payout payload (Mode: ${payoutMode})...`);

    const response = await fetch('https://api.razorpay.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'X-Payout-Idempotency': req.referenceId,
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error('❌ [RazorpayX Real Error]:', response.status, JSON.stringify(data, null, 2));
      throw new Error(`RazorpayX API failed with status ${response.status}: ${data.error?.description || JSON.stringify(data)}`);
    }

    console.log(`🎉 [RazorpayX Success]: Payout Created! ID: ${data.id}, Status: ${data.status}`);
    return {
      payoutId: data.id,
      status: data.status === 'processed' ? 'PROCESSED' : 'QUEUED',
      amount: req.amountInInr,
      utr: data.utr || 'PENDING_BANK_SYNC',
      timestamp: new Date().toISOString(),
    };
  },
};