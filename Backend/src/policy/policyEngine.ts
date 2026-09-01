export interface PolicyRules{
minGrossMarginPercent: number;
maxAutonomousSpendInr:number;
maxDiscountPercent: number;

}

export interface PolicyCheckInput{

actionType: 'BUYER_DISCOUNT' | 'SUPPLIER_PURCHASE' | 'PRICE_OVERRIDE';
unitCost : number;
offeredPrice: number;
msrp:number;
quantity:number;


}

export interface PolicyCheckOutput{
allowed: boolean;
verdict:'Overspend'|'Rejected' |'Approved';
marginPercent: number;
totalAmount: number;
requiresHumanApproval: boolean;
violationReason?:String


}


 export function checkPolicy(rules:PolicyRules,input: PolicyCheckInput):PolicyCheckOutput{


    const {unitCost,offeredPrice,quantity,msrp}=input;
    if(unitCost ==null || offeredPrice==null || quantity == null ||quantity<=0 ||msrp==null ||msrp<=0){

return {
verdict:'Rejected',
allowed:false,
marginPercent: 0,
totalAmount: 0,
requiresHumanApproval:true,
violationReason: 'Invalid  or missing input values'


};


    }

    const totalAmountoffered=offeredPrice * quantity;
    const totalCostIncurred=unitCost*quantity;
    const marginPercent= ((totalAmountoffered -totalCostIncurred)/totalAmountoffered)*100;

    if(marginPercent<rules.minGrossMarginPercent){


        return{
            verdict:'Rejected',
allowed: false,
marginPercent,
totalAmount:totalAmountoffered,
requiresHumanApproval:true,
violationReason:'margin=${marginPercent} less than ${rules.minGrossMarginPercent}'

        }
    }

const discountRequested=((msrp-offeredPrice)/msrp)*100;
if(discountRequested>=rules.maxDiscountPercent){
return {
verdict:"Rejected",
allowed:false,
marginPercent,
totalAmount:totalAmountoffered,
requiresHumanApproval:false,
violationReason:'Buyer requesting more dicount then  set for bulk orders'



};




}
if(totalAmountoffered>rules.maxAutonomousSpendInr){


    return {
verdict:"Overspend",
allowed:false,
marginPercent,
totalAmount:totalAmountoffered,
requiresHumanApproval:true,
violationReason:'Order value more then the limit set '



    }
}




return {
verdict:"Approved",
allowed:true,
marginPercent,
totalAmount:totalAmountoffered,
requiresHumanApproval:false,




};


};