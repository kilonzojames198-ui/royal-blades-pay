const BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let cached = { token: null, exp: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error('M-Pesa authentication failed');
  const data = await res.json();
  cached = { token: data.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return cached.token;
}

function normalizePhone(input) {
  const d = String(input || '').replace(/\D/g, '');
  const p = d.startsWith('0') ? '254' + d.slice(1) : /^[71]/.test(d) ? '254' + d : d;
  return /^254[71]\d{8}$/.test(p) ? p : null;
}

function stamp() {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const password = Buffer.from(process.env.MPESA_SHORTCODE + process.env.MPESA_PASSKEY + timestamp).toString('base64');
  return { timestamp, password };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function stkPush({ phone, amount, reference, description }) {
  const { timestamp, password } = stamp();
  const callback = `${process.env.MPESA_CALLBACK_URL}?token=${process.env.CALLBACK_SECRET}`;
  const data = await post('/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: process.env.MPESA_TXN_TYPE || 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: process.env.MPESA_PARTY_B || process.env.MPESA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: callback,
    AccountReference: String(reference).slice(0, 12),
    TransactionDesc: String(description).slice(0, 13),
  });
  if (data.ResponseCode !== '0') throw new Error(data.errorMessage || data.ResponseDescription || 'M-Pesa rejected the request');
  return data;
}

async function stkQuery(checkoutRequestId) {
  const { timestamp, password } = stamp();
  return post('/mpesa/stkpushquery/v1/query', {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  });
}

module.exports = { normalizePhone, stkPush, stkQuery };
