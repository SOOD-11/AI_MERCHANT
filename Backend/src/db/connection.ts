import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  waitForConnections: true,
  connectionLimit: 10,
});

async function test(){

try {
    const [rows]=await pool.query('select * from merchants');
    console.log('Connected lets go! here ar ethe merchants',rows);
    
} catch (error) {
    console.error('Connection failed',error);
}finally{

    await pool.end();
}

test();

}