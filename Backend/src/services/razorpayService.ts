import { configDotenv } from 'dotenv';
import Razorpay from 'razorpay';
import { query } from '../db/connection.js';
import { randomUUID } from 'crypto';
configDotenv();



export interface RazorpayPaymentLink{
paymentLinkId: string;
paymentLinkUrl: string;
orderId: string;
amount: number;

}
const rzp= new Razorpay({
key_id: process.env.RAZORPAY_KEY_ID||'rzp_test_TVCDbm7VMVcnRk',
key_secret:process.env.RAZORPAY_KEY_SECRET || 'gf6use7P83lytR7YbarQ4Hac'

});


export const RazorpayService={

createTestOrder:async(orderId:string,amountInInr:number)=>{
const amountInPaise=Math.round(amountInInr*100);
const rzpOrder=await rzp.orders.create({
amount: amountInPaise,
currency:'INR',
receipt:`receipt_${orderId.slice(1,10)}`,
notes:{orderId}

});

const transactionId=randomUUID();
await query(`Insert into transactions(id,order_id,rzp_order_id,amount,status)Values(?,?,?,?,'created')`,[transactionId,orderId,rzpOrder.id,amountInInr])

return  rzpOrder;


},

createPaymentLink: async(orderId :string,amountInInr :number,buyerEmail: string='AI_buyer123@gmail.com',buyerPhone: string='9875643210'): Promise<RazorpayPaymentLink> =>{

const amountInPaise=Math.round(amountInInr*100);
const paymentLink=await rzp.paymentLink.create({
amount: amountInPaise,
currency:'INR',
accept_partial:false,
reference_id: orderId,
description:`Payment for Autonomous B2B Order ${orderId.slice(0, 8)}`,
customer:{
name:'Autonomous Corporate Ai Buyer',
email: buyerEmail,
contact: buyerPhone


},

notify: {sms:false,email:false},
reminder_enable:false,
notes:{orderId} 

});

const transactionId = randomUUID();
    await query(
      `INSERT INTO transactions (id, order_id, rzp_order_id, amount, status) 
       VALUES (?, ?, ?, ?, 'created')
       ON DUPLICATE KEY UPDATE rzp_order_id = VALUES(rzp_order_id), amount = VALUES(amount);`,
      [transactionId, orderId, paymentLink.id, amountInInr]
    );

    return {
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.short_url,
      orderId,
      amount: amountInInr,
    };





}


};
