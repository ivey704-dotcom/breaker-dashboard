'use client';

import dynamic from 'next/dynamic';
import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const DashboardClient = dynamic(() => import('./dashboard-client'), { ssr: false });
const supabase = createClient();

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setCodeSent(true);
    setMessage('We emailed you a 6-digit sign-in code.');
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const token = code.replace(/\D/g, '').slice(0, 6);
    if (token.length !== 6) {
      setMessage('Enter the full 6-digit code.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    });
    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSession(data.session);
  }

  if (loading) {
    return <main className="authShell"><p className="muted">Loading dashboard…</p></main>;
  }

  if (session) return <DashboardClient />;

  return (
    <main className="authShell">
      <section className="authCard">
        <div className="brandMark">BD</div>
        <p className="eyebrow">Breaker Dashboard</p>
        <h1>Your live break command center.</h1>
        <p className="muted">Sign in with a one-time 6-digit code. No password and no callback link required.</p>

        {!codeSent ? (
          <form className="formStack" onSubmit={sendCode}>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="breaker@example.com"
              />
            </label>
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send 6-digit code'}
            </button>
          </form>
        ) : (
          <form className="formStack" onSubmit={verifyCode}>
            <label>
              6-digit code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
              />
            </label>
            <button className="primary" type="submit" disabled={submitting || code.length !== 6}>
              {submitting ? 'Verifying…' : 'Verify and enter dashboard'}
            </button>
            <button className="ghost" type="button" onClick={() => { setCodeSent(false); setCode(''); setMessage(''); }}>
              Use a different email
            </button>
          </form>
        )}

        {message ? <p className="notice">{message}</p> : null}
      </section>
    </main>
  );
}
