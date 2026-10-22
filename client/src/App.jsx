import { useCallback, useEffect, useState } from 'react';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

const kes = (n) => `KES ${Number(n).toLocaleString('en-KE')}`;
const mask = (p) => `0${p.slice(3, 6)} ••• ${p.slice(-3)}`;
const LABEL = { PENDING: 'Waiting', PAID: 'Paid', FAILED: 'Failed', CANCELLED: 'Cancelled' };

function Login({ onToken }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { token } = await api('/login', { method: 'POST', body: { password } });
      localStorage.setItem('rb_token', token);
      onToken(token);
    } catch (err) { setError(err.message); }
  };
  return (
    <main className="narrow">
      <h1>Royal Blades Kinyozi</h1>
      <form className="card" onSubmit={submit}>
        <label>Staff password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p className="msg bad">{error}</p>}
        <button className="primary">Sign in</button>
      </form>
    </main>
  );
}

function Till({ token, signOut }) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(null); // { id, status, phone, receipt, desc }
  const [error, setError] = useState('');
  const [list, setList] = useState({ payments: [], today: { total: 0, count: 0 } });

  const guard = useCallback((err) => { if (err.status === 401) signOut(); else setError(err.message); }, [signOut]);
  const refresh = useCallback(() => api('/payments', { token }).then(setList).catch(guard), [token, guard]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll the active payment until it settles (max ~2 minutes)
  useEffect(() => {
    if (!active || active.status !== 'PENDING') return;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      try {
        const p = await api(`/payments/${active.id}`, { token });
        if (p.status !== 'PENDING' || tries > 40) {
          setActive({ ...active, status: p.status, receipt: p.mpesa_receipt, desc: p.result_desc });
          refresh();
        }
      } catch (err) { guard(err); }
    }, 3000);
    return () => clearInterval(t);
  }, [active, token, refresh, guard]);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { id } = await api('/pay', { method: 'POST', token, body: { phone, amount, description } });
      setActive({ id, status: 'PENDING', phone });
      refresh();
    } catch (err) { guard(err); }
  };

  const busy = active?.status === 'PENDING';
  const done = () => { setActive(null); setPhone(''); setAmount(''); setDescription(''); };

  return (
    <main>
      <header>
        <h1>Royal Blades Kinyozi</h1>
        <button className="link" onClick={signOut}>Sign out</button>
      </header>

      <div className="grid">
        <section>
          <h2>Request payment</h2>
          <form className="card" onSubmit={send}>
            <label>Customer phone
              <input inputMode="tel" placeholder="0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} required />
            </label>
            <label>Amount (KES)
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} required />
            </label>
            <label>What for (optional)
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Haircut and shave" disabled={busy} />
            </label>
            {error && <p className="msg bad">{error}</p>}
            <button className="primary" disabled={busy}>Send payment prompt</button>
          </form>

          {active && (
            <div className={`status ${active.status.toLowerCase()}`} role="status">
              {active.status === 'PENDING' && <p>Prompt sent to {active.phone}. Waiting for the customer to enter their M-Pesa PIN.</p>}
              {active.status === 'PAID' && <p>Paid. M-Pesa receipt {active.receipt || '(arriving shortly)'}.</p>}
              {(active.status === 'FAILED' || active.status === 'CANCELLED') &&
                <p>{active.status === 'CANCELLED' ? 'The customer cancelled the prompt.' : active.desc || 'The payment failed.'} You can send it again.</p>}
              {active.status !== 'PENDING' && <button onClick={done}>{active.status === 'PAID' ? 'Next customer' : 'Dismiss'}</button>}
            </div>
          )}
        </section>

        <section>
          <h2>Today</h2>
          <p className="total">{kes(list.today.total)} <span>from {list.today.count} payment{list.today.count === 1 ? '' : 's'}</span></p>
          {list.payments.length === 0 && <p className="muted">No payments yet. Send your first prompt.</p>}
          <ul className="list">
            {list.payments.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{kes(p.amount)}</strong>
                  <span className="muted"> {mask(p.phone)}{p.description ? `, ${p.description}` : ''}</span>
                  <div className="muted small">
                    {new Date(p.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' })}
                    {p.mpesa_receipt ? `, ${p.mpesa_receipt}` : ''}
                  </div>
                </div>
                <span className={`pill ${p.status.toLowerCase()}`}>{LABEL[p.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('rb_token'));
  const signOut = useCallback(() => { localStorage.removeItem('rb_token'); setToken(null); }, []);
  return (
    <>
      <div className="pole" aria-hidden="true" />
      {token ? <Till token={token} signOut={signOut} /> : <Login onToken={setToken} />}
    </>
  );
}
