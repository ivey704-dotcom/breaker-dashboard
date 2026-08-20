'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Organization = { id: string; name: string; slug: string };
type BreakNight = { id: string; name: string; status: 'draft' | 'live' | 'completed'; scheduled_for: string | null };
type BreakStatus = 'draft' | 'open' | 'full' | 'randomized' | 'completed';
type Break = { id: string; sequence_number: number; title: string; format: string; total_spots: number; price_per_spot: number; currency: string; status: BreakStatus };
type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'comped';
type Spot = { id: string; spot_number: number; buyer_name: string | null; payment_status: PaymentStatus; amount_paid: number; assignment: string | null };
type SpotFilter = 'all' | 'open' | 'unpaid' | 'paid';

const supabase = createClient();

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'breaker';
}

function formatLabel(format: string) {
  return format.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  const [breakFormat, setBreakFormat] = useState('random_teams');
  const [spotCount, setSpotCount] = useState(30);
  const [spotPrice, setSpotPrice] = useState(45);
  const [buyerName, setBuyerName] = useState('');
  const [buyerSpot, setBuyerSpot] = useState(1);
  const [spotFilter, setSpotFilter] = useState<SpotFilter>('all');
  const [spotView, setSpotView] = useState<'table' | 'grid'>('table');

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
      .insert({ break_night_id: night.id, sequence_number: sequence, title: breakTitle.trim(), format: breakFormat, total_spots: spotCount, price_per_spot: spotPrice, status: 'open' })
      .select('id,sequence_number,title,format,total_spots,price_per_spot,currency,status')
      .single();
    if (error) return setMessage(error.message);

    const rows = Array.from({ length: spotCount }, (_, index) => ({ break_id: newBreak.id, spot_number: index + 1 }));
    const { error: spotsError } = await supabase.from('spots').insert(rows);
    if (spotsError) return setMessage(spotsError.message);

    setBreaks((current) => [...current, newBreak as Break]);
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
    setBuyerSpot(nextOpenSpot(target.spot_number));
    setMessage(`Assigned ${target.spot_number} to buyer.`);
  }

  function nextOpenSpot(after = 0) {
    return spots.find((spot) => spot.spot_number > after && !spot.buyer_name)?.spot_number
      ?? spots.find((spot) => !spot.buyer_name)?.spot_number
      ?? 1;
  }

  async function clearBuyer(spot: Spot) {
    const { error } = await supabase.from('spots').update({ buyer_name: null, payment_status: 'unpaid', amount_paid: 0, assignment: null }).eq('id', spot.id);
    if (error) return setMessage(error.message);
    setSpots((current) => current.map((item) => item.id === spot.id ? { ...item, buyer_name: null, payment_status: 'unpaid', amount_paid: 0, assignment: null } : item));
  }

  async function updatePayment(spot: Spot, paymentStatus: PaymentStatus) {
    const price = Number(activeBreak?.price_per_spot ?? 0);
    const amount = paymentStatus === 'paid' ? price : paymentStatus === 'comped' ? 0 : Number(spot.amount_paid || 0);
    const { error } = await supabase.from('spots').update({ payment_status: paymentStatus, amount_paid: amount }).eq('id', spot.id);
    if (error) return setMessage(error.message);
    setSpots((current) => current.map((item) => item.id === spot.id ? { ...item, payment_status: paymentStatus, amount_paid: amount } : item));
  }

  async function updateBreakStatus(status: BreakStatus) {
    if (!activeBreak) return;
    const { error } = await supabase.from('breaks').update({ status }).eq('id', activeBreak.id);
    if (error) return setMessage(error.message);
    setBreaks((current) => current.map((item) => item.id === activeBreak.id ? { ...item, status } : item));
    setMessage(`Break #${activeBreak.sequence_number} marked ${status}.`);
  }

  const soldSpots = spots.filter((spot) => Boolean(spot.buyer_name)).length;
  const openSpots = spots.length - soldSpots;
  const paidCount = spots.filter((spot) => spot.payment_status === 'paid' || spot.payment_status === 'comped').length;
  const unpaidCount = spots.filter((spot) => spot.buyer_name && spot.payment_status === 'unpaid').length;
  const paidRevenue = spots.reduce((sum, spot) => sum + Number(spot.amount_paid || 0), 0);
  const expectedRevenue = activeBreak ? soldSpots * Number(activeBreak.price_per_spot) : 0;
  const outstanding = Math.max(0, expectedRevenue - paidRevenue);

  const filteredSpots = useMemo(() => spots.filter((spot) => {
    if (spotFilter === 'open') return !spot.buyer_name;
    if (spotFilter === 'unpaid') return Boolean(spot.buyer_name) && spot.payment_status === 'unpaid';
    if (spotFilter === 'paid') return Boolean(spot.buyer_name) && (spot.payment_status === 'paid' || spot.payment_status === 'comped');
    return true;
  }), [spots, spotFilter]);

  if (loading) return <main className="shell"><p className="muted">Loading dashboard…</p></main>;

  if (!session) {
    return (
      <main className="authShell">
        <section className="authCard">
          <div className="brandMark">BD</div>
          <p className="eyebrow">Breaker Dashboard</p>
          <h1>Your live break command center.</h1>
          <p className="muted">Manage spots, buyers, payments, randoms and giveaways without juggling spreadsheets during a stream.</p>
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
    <main className="appShell">
      <aside className="sideNav">
        <div className="brandMark small">BD</div>
        <nav aria-label="Workspace navigation">
          <button className="navItem active">Breaks</button>
          <button className="navItem" disabled>Randoms</button>
          <button className="navItem" disabled>Giveaways</button>
          <button className="navItem" disabled>History</button>
        </nav>
        <button className="navItem signOut" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>

      <div className="mainPane">
        <header className="appHeader">
          <div>
            <p className="eyebrow">{organization?.name ?? 'Breaker Dashboard'}</p>
            <h1>{night?.name ?? 'Create your first break night'}</h1>
            <p className="muted">Live workspace · {session.user.email}</p>
          </div>
          {night ? <span className={`nightPill ${night.status}`}>{night.status}</span> : null}
        </header>

        {!night ? (
          <section className="panel emptyState">
            <p className="eyebrow">First setup</p>
            <h2>Start a break night</h2>
            <p className="muted">A break night groups all breaks, buyers, randomizations and giveaways from one stream.</p>
            <form className="inlineForm" onSubmit={createNight}>
              <label>Night name<input value={nightName} onChange={(event) => setNightName(event.target.value)} /></label>
              <button className="primary" type="submit">Create break night</button>
            </form>
          </section>
        ) : (
          <>
            <section className="metrics metricsFour">
              <article><span>Breaks tonight</span><strong>{breaks.length}</strong><small>in this stream</small></article>
              <article><span>Spots sold</span><strong>{soldSpots}<i>/{activeBreak?.total_spots ?? 0}</i></strong><small>{openSpots} open</small></article>
              <article><span>Payments</span><strong>{paidCount}<i> paid</i></strong><small>{unpaidCount} unpaid</small></article>
              <article><span>Collected</span><strong>€{paidRevenue.toFixed(2)}</strong><small>€{outstanding.toFixed(2)} outstanding</small></article>
            </section>

            <section className="panel createPanel">
              <div className="sectionTitle">
                <div><p className="eyebrow">Tonight's queue</p><h2>Add a break</h2></div>
                <span>{breaks.length} configured</span>
              </div>
              <form className="createBreakForm" onSubmit={createBreak}>
                <label>Set / product<input required value={breakTitle} onChange={(event) => setBreakTitle(event.target.value)} placeholder="2026 Topps Chrome Baseball" /></label>
                <label>Format
                  <select value={breakFormat} onChange={(event) => setBreakFormat(event.target.value)}>
                    <option value="random_teams">Random Teams</option>
                    <option value="pick_your_team">Pick Your Team</option>
                    <option value="random_divisions">Random Divisions</option>
                    <option value="random_spots">Random Spots</option>
                  </select>
                </label>
                <label>Spots<input type="number" min="1" max="500" value={spotCount} onChange={(event) => setSpotCount(Number(event.target.value))} /></label>
                <label>Price<input type="number" min="0" step="0.01" value={spotPrice} onChange={(event) => setSpotPrice(Number(event.target.value))} /></label>
                <button className="primary" type="submit">+ Add</button>
              </form>
            </section>

            <section className="queueLayout">
              <aside className="panel breakQueue">
                <div className="sectionTitle"><h2>Break queue</h2><span>{breaks.length}</span></div>
                <div className="breakList">
                  {breaks.length ? breaks.map((item) => (
                    <button className={`breakRow ${item.id === activeBreakId ? 'active' : ''}`} key={item.id} onClick={() => setActiveBreakId(item.id)}>
                      <span className="breakNumber">#{item.sequence_number}</span>
                      <span className="breakInfo"><b>{item.title}</b><em>{formatLabel(item.format)} · €{Number(item.price_per_spot).toFixed(2)}</em></span>
                      <span className={`statusDot ${item.status}`} title={item.status} />
                    </button>
                  )) : <p className="muted emptyCopy">Add tonight's first break above.</p>}
                </div>
              </aside>

              {activeBreak ? (
                <section className="breakWorkspace">
                  <article className="panel breakHero">
                    <div>
                      <div className="heroMeta"><span>Break #{activeBreak.sequence_number}</span><span>{formatLabel(activeBreak.format)}</span></div>
                      <h2>{activeBreak.title}</h2>
                      <p className="muted">{soldSpots}/{activeBreak.total_spots} spots sold · €{Number(activeBreak.price_per_spot).toFixed(2)} per spot</p>
                    </div>
                    <div className="heroActions">
                      <select aria-label="Break status" value={activeBreak.status} onChange={(event) => updateBreakStatus(event.target.value as BreakStatus)}>
                        <option value="open">Open</option>
                        <option value="full">Full</option>
                        <option value="randomized">Randomized</option>
                        <option value="completed">Completed</option>
                      </select>
                      <span className={`statusBadge ${activeBreak.status}`}>{activeBreak.status}</span>
                    </div>
                  </article>

                  <article className="panel spotPanel">
                    <div className="spotToolbar">
                      <form className="assignForm" onSubmit={assignBuyer}>
                        <label>Buyer<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="CardKing22" /></label>
                        <label>Spot<input type="number" min="1" max={activeBreak.total_spots} value={buyerSpot} onChange={(event) => setBuyerSpot(Number(event.target.value))} /></label>
                        <button className="primary" type="submit">Assign</button>
                      </form>
                      <div className="viewControls" aria-label="Spot view controls">
                        <button className={spotView === 'table' ? 'active' : ''} onClick={() => setSpotView('table')}>List</button>
                        <button className={spotView === 'grid' ? 'active' : ''} onClick={() => setSpotView('grid')}>Grid</button>
                      </div>
                    </div>

                    <div className="filterBar">
                      {(['all','open','unpaid','paid'] as SpotFilter[]).map((filter) => (
                        <button key={filter} className={spotFilter === filter ? 'active' : ''} onClick={() => setSpotFilter(filter)}>
                          {filter === 'all' ? `All ${spots.length}` : filter === 'open' ? `Open ${openSpots}` : filter === 'unpaid' ? `Unpaid ${unpaidCount}` : `Paid ${paidCount}`}
                        </button>
                      ))}
                    </div>

                    {spotView === 'table' ? (
                      <div className="table">
                        <div className="tr head"><span>Spot</span><span>Buyer</span><span>Payment</span><span>Assignment</span><span /></div>
                        {filteredSpots.map((spot) => (
                          <div className="tr" key={spot.id}>
                            <strong>{String(spot.spot_number).padStart(2, '0')}</strong>
                            <span>{spot.buyer_name ?? <em className="muted">Open</em>}</span>
                            <span>
                              <select className={`paymentSelect ${spot.payment_status}`} disabled={!spot.buyer_name} value={spot.payment_status} onChange={(event) => updatePayment(spot, event.target.value as PaymentStatus)}>
                                <option value="unpaid">Unpaid</option>
                                <option value="paid">Paid</option>
                                <option value="partial">Partial</option>
                                <option value="comped">Comped</option>
                              </select>
                            </span>
                            <span>{spot.assignment ?? '—'}</span>
                            <span>{spot.buyer_name ? <button className="iconButton" title="Clear buyer" onClick={() => clearBuyer(spot)}>×</button> : null}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="spotGrid">
                        {filteredSpots.map((spot) => (
                          <button key={spot.id} className={`spotTile ${spot.buyer_name ? spot.payment_status : 'open'}`} onClick={() => setBuyerSpot(spot.spot_number)}>
                            <strong>{String(spot.spot_number).padStart(2, '0')}</strong>
                            <span>{spot.buyer_name ?? 'Open'}</span>
                            <em>{spot.buyer_name ? spot.payment_status : 'available'}</em>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>

                  <section className="toolCards">
                    <article className="toolCard featured">
                      <div><span className="toolIcon">R</span><div><p className="eyebrow">Randomizer</p><h3>Random teams</h3></div></div>
                      <p>Use the paid spot list, lock the inputs, then save a verification record.</p>
                      <button className="primary" disabled>Run randomizer · next</button>
                    </article>
                    <article className="toolCard">
                      <div><span className="toolIcon">G</span><div><p className="eyebrow">Giveaway</p><h3>Pick a winner</h3></div></div>
                      <p>Choose eligibility from paid buyers, all buyers, or a custom list.</p>
                      <button className="secondary" disabled>Run giveaway · next</button>
                    </article>
                    <article className="toolCard">
                      <div><span className="toolIcon">O</span><div><p className="eyebrow">OBS</p><h3>Live overlay</h3></div></div>
                      <p>Send spot counts, random results and winners to the stream.</p>
                      <button className="secondary" disabled>Open overlay · later</button>
                    </article>
                  </section>
                </section>
              ) : (
                <section className="panel emptyState"><h2>No active break</h2><p className="muted">Create a break to start managing spots.</p></section>
              )}
            </section>
          </>
        )}

        {message ? <div className="toast" role="status" onClick={() => setMessage('')}>{message}</div> : null}
      </div>
    </main>
  );
}