# Royal Blades Kinyozi: M-Pesa payment prompts

Node/Express API (Vercel serverless) + React (Vite). A cashier signs in, enters the customer's phone number and amount, and the customer gets an M-Pesa STK Push prompt. The result arrives by callback and shows live on screen.

## 1. Database
Create a free Postgres database (Neon, Supabase, or Vercel Postgres), run `schema.sql` in its SQL editor, and copy the connection string.

## 2. Daraja
Create an app at developer.safaricom.co.ke. Copy the consumer key and secret. In the sandbox, use the test shortcode and passkey shown on the STK Push simulator page. For go-live, use the shop's Paybill or Till.
- Paybill: `MPESA_TXN_TYPE=CustomerPayBillOnline`
- Till: `MPESA_TXN_TYPE=CustomerBuyGoodsOnline`, `MPESA_SHORTCODE` = store number, `MPESA_PARTY_B` = till number

## 3. Deploy
1. Push this folder to GitHub.
2. In Vercel, import the repo (leave the framework preset on "Other").
3. Add every variable from `.env.example` in Project Settings, Environment Variables. Set `MPESA_CALLBACK_URL` to `https://<your-app>.vercel.app/api/mpesa/callback`.
4. Redeploy. Every push to GitHub redeploys automatically.

## Run locally
```
cp .env.example .env     # fill it in
npm install && (cd client && npm install)
npm run dev:api          # terminal 1
npm run dev:client       # terminal 2, open http://localhost:5173
```
For callbacks locally, expose port 3001 with ngrok and use that URL as `MPESA_CALLBACK_URL`.
