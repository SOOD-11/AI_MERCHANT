import { randomUUID } from "crypto";
import { query } from "../db/connection.js";

interface AuditLogInput{
orderId?: string  | null;
agentRole: string;
action: string;
inputJson?: any;
decision: string;
reason: string;

}

 export const  logAgentAction =async(input : AuditLogInput) : Promise<void> =>{
const auditId=randomUUID();
await query(`insert into agent_actions(id,order_Id,agent_role,action,input_json,decision,reason) values (?,?,?,?,?,?,?)`,
 [

            auditId,

            input.orderId || null,

            input.agentRole,

            input.action,

            input.inputJson

                ? JSON.stringify(input.inputJson)

                : null,

            input.decision,

            input.reason

        ]);






}