import { configDotenv } from 'dotenv';
import Razorpay from 'razorpay';
import { query } from '../db/connection.js';
import { randomUUID } from 'crypto';
configDotenv();
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


}




};
