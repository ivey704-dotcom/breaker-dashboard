'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Organization = { id: string; name: string; slug: string };
type BreakNight = { id: string; name: string; status: 'draft' | 'live' | 'completed'; scheduled_for: string | null };
type Break = { id: string; sequence_number: number; title: string; format: string; total_spots: number; price_per_spot: number; currency: string; status: string };
type Spot = { id: string; spot_number: number; buyer_name: string | null; payment_status: 'unpaid' | 'paid' | 'partial' | 'comped'; amount_paid: number; assignment: string | null };

const supabase = createClient();

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'breaker';
}

export default function DashboardClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [night, setNight] = useState<BreakNight | null>(null);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [activeBreakId, setActiveBreakId] = useState<string | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [nightName, setNightName] = useState('Friday Night Breaks');
  const [breakTitle, setBreakTitle] = useState('');
  const [spotCount, setSpotCount] = useState(30);
  const [spotPrice, setSpotPrice] = useState(45);
  const [buyerName, setBuyerName] = useState('');
  const [buyerSpot, setBuyerSpot] = useState(1);

  const activeBreak = useMemo(() => breaks.find((item) => item.id === activeBreakId) ?? null, [breaks, activeBreakId]);

  const loadOrganization = useCallback(async (userId: string, userEmail?: string) => {
    const { data: existing, error } = await supabase.from('organizations').select('id,name,slug').eq('owner_id', userId).limit(1).maybeSingle();
    if (error) throw error;
    if (existing) {
      setOrganization(existing);
      return existing as Organization;
    }

    const baseName = userEmail?.split('@')[0] || 'My Breaks';
    const { data: created, error: createError } = await supabase
      .from('organizations')
      .insert({ owner_id: userId, name: `${baseName} Breaks`, slug: `${slugify(baseName)}-${userId.slice(0, 6)}` })
      .select('id,name,slug')
      .single();
    if (createError) throw createError;
    setOrganization(created);
    return created as Organization;
  }, []);

  const loadNightAndBreaks = useCallback(async (orgId: string) => {
    const { data: latestNight, error: nightError } = await supabase
      .from('break_nights')
      .select('id,name,status,scheduled_for')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (nightError) throw nightError;
    setNight(latestNight as BreakNight | null);

    if (!latestNight) {
      setBreaks([]);
      setActiveBreakId(null);
      setSpots([]);
      return;
    }

    const { data: breakRows, error: breakError } = await supabase
      .from('breaks')
      .select('id,sequence_number,title,format,total_spots,price_per_spot,currency,status')
      .eq('break_night_id', latestNight.id)
      .order('sequence_number');
    if (breakError) throw breakError;
    const typed = (breakRows ?? []) as Break[];
    setBreaks(typed);
    setActiveBreakId((current) => current && typed.some((item) => item.id === current) ? current : typed[0]?.id ?? null);
  }, []);

  const loadSpots = useCallback(async (breakId: string | null) => {
    if (!breakId) {
      setSpots([]);
      return;
    }
    const { data, error } = await supabase
      .from('spots')
      .select('id,spot_number,buyer_name,payment_status,amount_paid,assignment')
      .eq('break_id', breakId)
      .order('spot_number');
    if (error) throw error;
    setSpots((data ?? []) as Spot[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setOrganization(null);
      setNight(null);
      setBreaks([]);
      setSpots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const org = await loadOrganization(session.user.id, session.user.email);
        if (!cancelled) await loadNightAndBreaks(org.id);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load your dashboard.');
      }
    })();
    return () => { cancelled = true; };
  }, [session, loadOrganization, loadNightAndBreaks]);

  useEffect(() => {
    loadSpots(activeBreakId).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load spots.'));
  }, [activeBreakId, loadSpots]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : 'Check your email for the magic sign-in link.');
  }

  async function createNight(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    const { data, error } = await supabase.from('break_nights').insert({ organization_id: organization.id, name: nightName, status: 'live' }).select('id,name,status,scheduled_for').single();
    if (error) return setMessage(error.message);
    setNight(data as BreakNight);
    setBreaks([]);
    setSpots([]);
    setActiveBreakId(null);
    setMessage('Break night created.');
  }

  async function createBreak(event: FormEvent) {
    event.preventDefault();
    if (!night || !breakTitle.trim()) return;
    const sequence = breaks.length ? Math.max(...breaks.map((item) => item.sequence_number)) + 1 : 1;
    const { data: newBreak, error } = await supabase
      .from('breaks')
      .insert({ break_night_id: night.id, sequence_number: sequence, title: breakTitle.trim(), total_spots: spotCount, price_per_spot: spotPrice, status: 'open' })
      .select('id,sequence_number,title,format,total_spots,price_per_spot,currency,status')
      .single();
    if (error) return setMessage(error.message);

    const rows = Array.from({ length: spotCount }, (_, index) => ({ break_id: newBreak.id, spot_number: index + 1 }));
    const { error: spotsError } = await supabase.from('spots').insert(rows);
    if (spotsError) return setMessage(spotsError.message);

    const next = [...breaks, newBreak as Break];
    setBreaks(next);
    setActiveBreakId(newBreak.id);
    setBreakTitle('');
    setMessage(`Break #${sequence} created with ${spotCount} spots.`);
  }

  async function assignBuyer(event: FormEvent) {
    event.preventDefault();
    const target = spots.find((spot) => spot.spot_number === buyerSpot);
    if (!target || !buyerName.trim()) return;
    const { error } = await supabase.from('spots').update({ buyer_name: buyerName.trim() }).eq('id', target.id);
    if (error) return setMessage(error.message);
    setSpots((current) => current.map((spot) => spot.id === target.id ? { ...spot, buyer_name: buyerName.trim() } : spot));
    setBuyerName('');
    setMessage(`Assigned spot ${buyerSpot}.`);
  }

  async function togglePaid(spot: Spot) {
    const paid = spot.payment_status !== 'paid';
    const nextStatus = paid ? 'paid' : 'unpaid';
    const amount = paid ? Number(activeBreak?.price_per_spot ?? 0) : 0;
    const { error } = await supabase.from('spots').update({ payment_status: nextStatus, amount_paid: amount }).eq('id', spot.id);
    if (error) return setMessage(error.message);
    setSpots((current) => current.map((item) => item.id === spot.id ? { ...item, payment_status: nextStatus, amount_paid: amount } : item));
  }

  const paidRevenue = spots.reduce((sum, spot) => sum + Number(spot.amount_paid || 0), 0);
  const soldSpots = spots.filter((spot) => Boolean(spot.buyer_name)).length;

  if (loading) return <main className="shell"><p className="muted">Loading dashboard…</p></main>;

  if (!session) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Breaker Dashboard</p>
          <h1>Run your break night from one place.</h1>
          <p className="muted">Sign in with a magic link. Your breaks, buyers, and payment status are saved securely to your account.</p>
          <form className="formStack" onSubmit={signIn}>
            <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="breaker@example.com" /></label>
            <button className="primary" type="submit">Send magic link</button>
          </form>
          {message ? <p className="notice">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{organization?.name ?? 'Breaker Dashboard'}</p>
          <h1>{night?.name ?? 'Create your first break night'}</h1>
          <p className="muted">Signed in as {session.user.email}</p>
        </div>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      {!night ? (
        <section className="panel compactPanel">
          <h2>Start a break night</h2>
          <form className="inlineForm" onSubmit={createNight}>
            <label>Night name<input value={nightName} onChange={(event) => setNightName(event.target.value)} /></label>
            <button className="primary" type="submit">Create break night</button>
          </form>
        </section>
      ) : (
        <>
          <section className="metrics">
            <article><span>Breaks tonight</span><strong>{breaks.length}</strong></article>
            <article><span>Current break spots</span><strong>{soldSpots} / {activeBreak?.total_spots ?? 0}</strong></article>
            <article><span>Current break paid</span><strong>€{paidRevenue.toFixed(2)}</strong></article>
          </section>

          <section className="panel">
            <div className="sectionTitle"><div><p className="eyebrow">Break night</p><h2>{night.name}</h2></div><span>{night.status}</span></div>
            <form className="createBreakForm" onSubmit={createBreak}>
              <label>Set / product<input required value={breakTitle} onChange={(event) => setBreakTitle(event.target.value)} placeholder="2026 Topps Chrome Baseball" /></label>
              <label>Spots<input type="number" min="1" max="500" value={spotCount} onChange={(event) => setSpotCount(Number(event.target.value))} /></label>
              <label>Price / spot<input type="number" min="0" step="0.01" value={spotPrice} onChange={(event) => setSpotPrice(Number(event.target.value))} /></label>
              <button className="primary" type="submit">+ Add break</button>
            </form>
          </section>

          <section className="panel">
            <div className="sectionTitle"><h2>Breaks</h2><span>{breaks.length ? 'Select a break to manage it' : 'No breaks yet'}</span></div>
            <div className="breakList">
              {breaks.map((item) => (
                <button className={`breakRow ${item.id === activeBreakId ? 'active' : ''}`} key={item.id} onClick={() => setActiveBreakId(item.id)}>
                  <span><b>#{item.sequence_number}</b><em>{item.title}</em></span>
                  <span className="right"><b>{item.total_spots} spots</b><em>€{Number(item.price_per_spot).toFixed(2)} / spot</em></span>
                </button>
              ))}
            </div>
          </section>

          {activeBreak ? (
            <section className="workspace">
              <article className="panel">
                <p className="eyebrow">Break #{activeBreak.sequence_number}</p>
                <h2>{activeBreak.title}</h2>
                <p className="muted">{activeBreak.total_spots} spots · €{Number(activeBreak.price_per_spot).toFixed(2)}/spot</p>

                <form className="assignForm" onSubmit={assignBuyer}>
                  <label>Buyer<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="CardKing22" /></label>
                  <label>Spot<input type="number" min="1" max={activeBreak.total_spots} value={buyerSpot} onChange={(event) => setBuyerSpot(Number(event.target.value))} /></label>
                  <button className="secondary" type="submit">Assign buyer</button>
                </form>

                <div className="table">
                  <div className="tr head"><span>Spot</span><span>Buyer</span><span>Payment</span><span>Assignment</span></div>
                  {spots.map((spot) => (
                    <div className="tr" key={spot.id}>
                      <span>{String(spot.spot_number).padStart(2, '0')}</span>
                      <span>{spot.buyer_name ?? <em className="muted">Open</em>}</span>
                      <span><button className={`statusButton ${spot.payment_status === 'paid' ? 'paid' : 'unpaid'}`} disabled={!spot.buyer_name} onClick={() => togglePaid(spot)}>{spot.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</button></span>
                      <span>{spot.assignment ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </article>

              <aside className="stack">
                <article className="panel action"><p className="eyebrow">Next milestone</p><h3>Randomizer</h3><p className="muted">The buyer and payment data is now real. Randomization and immutable verification records are the next feature.</p></article>
                <article className="panel action"><p className="eyebrow">Saved automatically</p><h3>Database-backed</h3><p className="muted">Refresh the page and your break night, breaks, buyers, and payment status remain stored in Supabase.</p></article>
              </aside>
            </section>
          ) : null}
        </>
      )}

      {message ? <div className="toast" role="status">{message}</div> : null}
    </main>
  );
}
