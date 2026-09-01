export interface SupplierQuote{
unitWholeSaleCost: number;
availableUnits:number;
deliveryDays: number;
supplierName: string;

}

export const requestSupplierQuote=async(sku:string,quantityNeeded: number) : Promise<SupplierQuote> =>{

let baseWholesale=65000;
if(quantityNeeded >=20){
baseWholesale=58000;
} else if(quantityNeeded>=10){
    baseWholesale=61000;
}


return {

unitWholeSaleCost: baseWholesale,
availableUnits:100,
deliveryDays:2,
supplierName:'Global Chipset Wholesalers Ltd'


};

};