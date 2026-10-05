# ShopNext MySQL Product Store + M-Pesa STK Push

## Requirements
- Node.js 18+ (Node 24 is fine for this pure-JS MySQL driver)
- MySQL Server 8+ running locally
- VS Code or another terminal

## Setup on Windows
1. Extract the ZIP and open the `ShopNext_MySQL_Store` folder in VS Code.
2. Ensure MySQL Server is running. Create a MySQL user or use your local development account.
3. Copy `.env.example` to `.env` and set `DB_USER` and `DB_PASSWORD`. `DB_NAME` defaults to `shopnext_store`.
4. In the project terminal run `npm install`, then `npm start`.
5. Visit http://localhost:3000.

The app creates the configured database and tables on startup. The MySQL account must have permission to create the database and tables. If you prefer creating the database manually, execute `CREATE DATABASE shopnext_store CHARACTER SET utf8mb4;` in MySQL, and grant the configured account access.

## Real Daraja sandbox
Set `MPESA_ENV=sandbox`, Daraja consumer key/secret, shortcode, passkey, and a publicly reachable HTTPS callback URL. Safaricom cannot call localhost directly; use a secure HTTPS tunnel or deployed backend. Restart Node after changing `.env`. Demo checkout saves a pending order but sends no STK prompt.

## API
- `GET /api/health`
- `GET /api/products`
- `POST /api/checkout` JSON `{ "phone":"0712345678", "items":[{"id":1,"quantity":1}] }`
- `POST /api/mpesa/callback`
- `GET /api/orders/:id`
- Admin: `POST /api/products` and `GET /api/orders`, requiring `x-admin-key` matching `ADMIN_KEY`.

Prices are represented as whole KES values in this starter; STK request amount uses whole KES. Production readiness requires rigorous callback verification, idempotency, payment reconciliation, secure admin authentication, HTTPS, request throttling, monitoring, and operational backups. Never commit `.env` or put Daraja secrets in browser JavaScript.
