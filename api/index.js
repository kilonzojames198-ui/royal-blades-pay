const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./_lib/db');
const mpesa = require('./_lib/mpesa');

const app = express();
app.use(express.json());

const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
});

const auth = (req, res, next) => {
  try {
    jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Sign in again.' });
  }
};

app.post('/api/login', (req, res) => {
  if (req.body.password && req.body.password === process.env.STAFF_PASSWORD) {
    return res.json({ token: jwt.sign({ role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '12h' }) });
  }
  res.status(401).json({ error: 'Wrong password.' });
});

// Send the M-Pesa prompt to the customer's phone
app.post('/api/pay', auth, h(async (req, res) => {
  const phone = mpesa.normalizePhone(req.body.phone);
  const amount = Math.round(Number(req.body.amount));
  const description = String(req.body.description || '').slice(0, 100);
  if (!phone) return res.status(400).json({ error: 'Enter a valid Safaricom number, like 0712345678.' });
  if (!(amount >= 1 && amount <= 150000)) return res.status(400).json({ error: 'Enter an amount between 1 and 150,000.' });

  const { rows: [p] } = await db.query(
    'insert into payments (phone, amount, description) values ($1,$2,$3) returning id', [phone, amount, description]);
  try {
    const r = await mpesa.stkPush({ phone, amount, reference: `RB${p.id}`, description: 'Royal Blades' });
    await db.query('update payments set checkout_request_id=$1, merchant_request_id=$2 where id=$3',
      [r.CheckoutRequestID, r.MerchantRequestID, p.id]);
    res.json({ id: p.id });
  } catch (e) {
    await db.query("update payments set status='FAILED', result_desc=$1, updated_at=now() where id=$2", [e.message.slice(0, 200), p.id]);
    res.status(502).json({ error: `Could not send the prompt. ${e.message}` });
  }
}));

// Safaricom calls this with the result. Safe to receive twice.
app.post('/api/mpesa/callback', h(async (req, res) => {
  if (req.query.token !== process.env.CALLBACK_SECRET) return res.status(403).end();
  const cb = req.body?.Body?.stkCallback;
  if (cb) {
    const items = cb.CallbackMetadata?.Item || [];
    const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value || null;
    const status = cb.ResultCode === 0 ? 'PAID' : cb.ResultCode === 1032 ? 'CANCELLED' : 'FAILED';
    await db.query(
      `update payments set status=$1, mpesa_receipt=$2, result_desc=$3, updated_at=now()
       where checkout_request_id=$4 and (status='PENDING' or ($1='PAID' and status='PAID' and mpesa_receipt is null))`,
      [status, receipt, cb.ResultDesc, cb.CheckoutRequestID]);
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}));

// Status of one payment. If the callback is late, ask Safaricom directly.
app.get('/api/payments/:id', auth, h(async (req, res) => {
  let { rows: [p] } = await db.query('select * from payments where id=$1', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  if (p.status === 'PENDING' && p.checkout_request_id && Date.now() - new Date(p.created_at) > 40000) {
    const q = await mpesa.stkQuery(p.checkout_request_id);
    if (q.ResultCode !== undefined && !q.errorCode) {
      const code = Number(q.ResultCode);
      const status = code === 0 ? 'PAID' : code === 1032 ? 'CANCELLED' : 'FAILED';
      ({ rows: [p] } = await db.query(
        "update payments set status=$1, result_desc=$2, updated_at=now() where id=$3 and status='PENDING' returning *",
        [status, q.ResultDesc, p.id]).then((r) => (r.rows.length ? r : { rows: [p] })));
    }
  }
  res.json(p);
}));

// Recent payments plus today's total (Nairobi time)
app.get('/api/payments', auth, h(async (req, res) => {
  const { rows } = await db.query('select * from payments order by id desc limit 50');
  const { rows: [t] } = await db.query(
    `select coalesce(sum(amount),0)::int as total, count(*)::int as count from payments
     where status='PAID' and created_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'`);
  res.json({ payments: rows, today: t });
}));

module.exports = app;
