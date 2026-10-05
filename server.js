import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app=express(), __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(cors()); app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));
const pool=mysql.createPool({host:process.env.DB_HOST||"localhost",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||"root",password:process.env.DB_PASSWORD||"",database:process.env.DB_NAME||"shopnext_store",waitForConnections:true,connectionLimit:10,decimalNumbers:true});
async function init(){
 const conn=await mysql.createConnection({host:process.env.DB_HOST||"localhost",port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||"root",password:process.env.DB_PASSWORD||""});
 const db=(process.env.DB_NAME||"shopnext_store").replace(/[^a-zA-Z0-9_]/g,"");
 await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await conn.end();
 await pool.query(`CREATE TABLE IF NOT EXISTS products(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(180) NOT NULL,category VARCHAR(100) NOT NULL DEFAULT 'General',description TEXT,price INT NOT NULL,stock INT NOT NULL DEFAULT 0,image TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS orders(id CHAR(36) PRIMARY KEY,phone VARCHAR(15) NOT NULL,amount INT NOT NULL,items JSON NOT NULL,status ENUM('PENDING','PAID','FAILED') NOT NULL DEFAULT 'PENDING',checkout_id VARCHAR(100),merchant_request_id VARCHAR(100),mpesa_receipt VARCHAR(50),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(checkout_id)) ENGINE=InnoDB`);
 const [[{n}]]=await pool.query("SELECT COUNT(*) n FROM products");
 if(!n){const rows=[
 ["Wireless Headphones","Electronics","Comfortable wireless audio",5999,25,"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700"],
 ["Smart Watch","Electronics","Everyday smart watch",9999,15,"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700"],
 ["Backpack","Accessories","Durable daily backpack",4999,30,"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700"],
 ["Bluetooth Speaker","Electronics","Portable sound",3999,20,"https://images.unsplash.com/photo-1608043152269-423 db4d4f?",""],
 ["Laptop","Computers","Work and study laptop",79999,10,"https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=700"],
 ["Wireless Mouse","Accessories","Ergonomic mouse",1999,40,"https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=700"],
 ["Gaming Keyboard","Computers","RGB mechanical keyboard",8999,12,"https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=700"],
 ["Phone Stand","Accessories","Adjustable desk stand",1499,35,"https://images.unsplash.com/photo- આય?",""]
 ].filter(x=>x[5]?.startsWith("https://images.unsplash.com/photo-"));
 for(const p of rows)await pool.query("INSERT INTO products(name,category,description,price,stock,image) VALUES(?,?,?,?,?,?)",p);
 }
 console.log(`MySQL connected; database '${db}' and tables are ready.`);
}
const digits=v=>String(v??"").replace(/\D/g,"");
function normalizePhone(v){let n=digits(v);if(n.startsWith("0"))n="254"+n.slice(1);if(n.startsWith("7")||n.startsWith("1"))n="254"+n;return n;}
app.get("/api/health",async(req,res)=>{try{await pool.query("SELECT 1");res.json({status:"UP",database:"MySQL"})}catch{res.status(503).json({status:"DOWN"})}});
app.get("/api/products",async(req,res)=>{try{const [rows]=await pool.query("SELECT * FROM products ORDER BY id DESC");res.json(rows)}catch(e){res.status(500).json({message:"Could not load products"})}});
app.post("/api/products",async(req,res)=>{if(!process.env.ADMIN_KEY||req.get("x-admin-key")!==process.env.ADMIN_KEY)return res.sendStatus(401);const {name,category="General",description="",price,stock,image=""}=req.body;if(!name||!Number.isInteger(+price)||+price<1||!Number.isInteger(+stock)||+stock<0)return res.status(400).json({message:"Valid name, price and stock are required"});try{const [r]=await pool.query("INSERT INTO products(name,category,description,price,stock,image) VALUES(?,?,?,?,?,?)",[name,category,description,+price,+stock,image]);res.status(201).json({id:r.insertId})}catch{res.sendStatus(500)}});
app.get("/api/orders",async(req,res)=>{if(!process.env.ADMIN_KEY||req.get("x-admin-key")!==process.env.ADMIN_KEY)return res.sendStatus(401);const [rows]=await pool.query("SELECT id,phone,amount,status,mpesa_receipt,created_at FROM orders ORDER BY created_at DESC");res.json(rows)});
async function getToken(){const host=process.env.MPESA_ENV==="production"?"https://api.safaricom.co.ke":"https://sandbox.safaricom.co.ke";const auth=Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");const r=await fetch(host+"/oauth/v1/generate?grant_type=client_credentials",{headers:{Authorization:`Basic ${auth}`}});const j=await r.json();if(!r.ok||!j.access_token)throw Error(j.errorMessage||"Daraja OAuth failed");return {host,access:j.access_token};}
app.post("/api/checkout",async(req,res)=>{let conn;try{const phone=normalizePhone(req.body.phone),items=req.body.items;if(!/^254[17]\d{8}$/.test(phone))return res.status(400).json({message:"Enter a valid Kenyan mobile number"});if(!Array.isArray(items)||!items.length)return res.status(400).json({message:"Cart is empty"});
 conn=await pool.getConnection();await conn.beginTransaction();let total=0,lines=[];
 for(const it of items){const qty=Number(it.quantity);if(!Number.isInteger(qty)||qty<1)throw Error("Invalid item quantity");const [rows]=await conn.query("SELECT id,name,price,stock FROM products WHERE id=? FOR UPDATE",[Number(it.id)]);const p=rows[0];if(!p||qty>p.stock)throw Error("Product unavailable or quantity exceeds stock");total+=p.price*qty;lines.push({id:p.id,name:p.name,price:p.price,quantity:qty});}
 const id=crypto.randomUUID();await conn.query("INSERT INTO orders(id,phone,amount,items,status) VALUES(?,?,?,?,?)",[id,phone,total,JSON.stringify(lines),"PENDING"]);await conn.commit();conn.release();conn=null;
 const ready=process.env.MPESA_CONSUMER_KEY&&process.env.MPESA_CONSUMER_SECRET&&process.env.MPESA_PASSKEY&&process.env.MPESA_CALLBACK_URL?.startsWith("https://");
 if(!ready)return res.json({orderId:id,status:"PENDING",amount:total,mode:"demo",message:"Order saved in MySQL demo mode; no real STK prompt was sent. Configure Daraja credentials and HTTPS callback."});
 const {host,access}=await getToken(),ts=new Date().toISOString().replace(/[-T:.Z]/g,"").slice(0,14),short=process.env.MPESA_SHORTCODE,password=Buffer.from(short+process.env.MPESA_PASSKEY+ts).toString("base64");
 const body={BusinessShortCode:short,Password:password,Timestamp:ts,TransactionType:"CustomerPayBillOnline",Amount:Math.ceil(total/100),PartyA:phone,PartyB:short,PhoneNumber:phone,CallBackURL:process.env.MPESA_CALLBACK_URL,AccountReference:"ShopNext",TransactionDesc:`Order ${id.slice(0,10)}`};
 const r=await fetch(host+"/mpesa/stkpush/v1/processrequest",{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify(body)}),j=await r.json();if(!r.ok||j.ResponseCode!=="0")throw Error(j.errorMessage||j.ResponseDescription||"STK request rejected");
 await pool.query("UPDATE orders SET checkout_id=?,merchant_request_id=? WHERE id=?",[j.CheckoutRequestID,j.MerchantRequestID,id]);res.json({orderId:id,status:"PENDING",amount:total,mode:"live",message:"STK prompt requested. Complete payment on your phone."});
 }catch(e){if(conn){try{await conn.rollback()}catch{}conn.release()}res.status(400).json({message:e.message||"Checkout failed"});}});
app.post("/api/mpesa/callback",async(req,res)=>{try{const cb=req.body?.Body?.stkCallback;if(!cb)return res.json({ResultCode:0,ResultDesc:"Accepted"});const [orders]=await pool.query("SELECT id,status FROM orders WHERE checkout_id=?",[cb.CheckoutRequestID]);const order=orders[0];if(order&&order.status==="PENDING"){if(Number(cb.ResultCode)===0){const meta=cb.CallbackMetadata?.Item||[],receipt=meta.find(x=>x.Name==="MpesaReceiptNumber")?.Value;const conn=await pool.getConnection();try{await conn.beginTransaction();const [locked]=await conn.query("SELECT status,items FROM orders WHERE id=? FOR UPDATE",[order.id]);if(locked[0]?.status==="PENDING"){for(const item of locked[0].items){const [u]=await conn.query("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?",[item.quantity,item.id,item.quantity]);if(!u.affectedRows)throw Error("Stock update conflict")}await conn.query("UPDATE orders SET status='PAID',mpesa_receipt=? WHERE id=?",[receipt||null,order.id]);}await conn.commit()}catch(e){await conn.rollback();throw e}finally{conn.release()}}else await pool.query("UPDATE orders SET status='FAILED' WHERE id=? AND status='PENDING'",[order.id]);}res.json({ResultCode:0,ResultDesc:"Accepted"})}catch(e){console.error("Callback processing error:",e);res.status(500).json({ResultCode:1,ResultDesc:"Callback processing failed"})}});
app.get("/api/orders/:id",async(req,res)=>{const [rows]=await pool.query("SELECT id,amount,status,created_at FROM orders WHERE id=?",[req.params.id]);rows[0]?res.json(rows[0]):res.sendStatus(404)});
init().then(()=>app.listen(process.env.PORT||3000,()=>console.log(`ShopNext running at http://localhost:${process.env.PORT||3000}`))).catch(e=>{console.error("Startup failed:",e.message);process.exit(1)});
