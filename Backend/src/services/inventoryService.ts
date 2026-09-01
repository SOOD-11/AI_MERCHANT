import {query} from '../db/connection.js';

interface ProductInventoryRecord{
productId: string;
sku: string;
name: string;
msrp :number;
baseCost: number;
quantityAvailable: number;
quantityReserved: number;

}


 export const InventoryService={
 getProductBySku : async(sku :string) :Promise<ProductInventoryRecord | null> =>{

const rows= await query(`select p.id as productId,p.sku ,p.name,p.msrp, p.base_cost as baseCost,
    i.quantity_available as quantityAvailable,
    i.quantity_reserved as quantityReserved 
    from products p join inventory i 
    on  p.id=i.product_id 
    where p.sku= ? 
    Limit 1`,
    [sku]) as ProductInventoryRecord[];

if(rows.length === 0) return null;
const r=rows[0];

return {


    productId:r.productId,
    sku:r.sku,
    name:r.name,
    msrp: r.msrp,
    baseCost:r.baseCost,
    quantityAvailable:r.quantityAvailable,
    quantityReserved:r.quantityReserved,

}



 },


 reserveStock : async(productId: string,quantity:  number) : Promise<boolean> =>{

const result= await query(`update inventory Set quantity_available=quantity_available-? ,quantity_reserved=quantity_reserved+ ? where product_id = ? and quantity_available >=?`,[quantity,quantity,productId,quantity]);

return result.affectedRows>0;


 },

finalizeDeduction: async(productId : string,quantity :number): Promise<void> =>{

await query(`update inventory 
     set quantity_reserved=quantity_reserved - ? 
     where product_id=? `,
     [quantity,productId]);
},

releaseReservation: async(productId: string,quantity: number): Promise<void> =>{
await query(`update inventory 
     set quantity_available=quantity_available + ?
     ,quantity_reserved=quantity_reserved - ? 
     where productId= ?`,
     [quantity,quantity,productId]);

}



};


