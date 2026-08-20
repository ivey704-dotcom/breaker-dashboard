'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { randomOverlayToken, securePick, secureShuffle, TEAM_PRESETS, verificationCode } from '@/lib/breaker-utils';

type Organization = { id: string; name: string; slug: string };
type BreakNight = { id: string; name: string; status: 'draft' | 'live' | 'completed'; scheduled_for: string | null };
type BreakStatus = 'draft' | 'open' | 'full' | 'randomized' | 'completed';
type Break = { id: string; sequence_number: number; title: string; format: string; total_spots: number; price_per_spot: number; currency: string; status: BreakStatus };
type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'comped';
type Spot = { id: string; spot_number: number; buyer_name: string | null; payment_status: PaymentStatus; amount_paid: number; assignment: string | null };
type SpotFilter = 'all' | 'open' | 'unpaid' | 'paid';
type WorkspaceTab = 'breaks' | 'randoms' | 'giveaways' | 'history';
type Randomization = { id: string; verification_code: string; input_snapshot: Record<string, unknown>; result_snapshot: Record<string, unknown>; created_at: string };
type Giveaway = { id: string; prize: string; eligible_entries: unknown; winner: Record<string, unknown>; verification_code: string; created_at: string; break_id: string | null };
type Customer = { id: string; display_name: string; handle: string | null; notes: string | null; created_at: string };
type CustomerSummary = { key: string; name: string; totalSpots: number; paidSpots: number; totalPaid: number; breaks: number };
type OverlaySnapshot = { breakTitle: string; sequence: number; format: string; status: string; sold: number; total: number; spots: Array<{ spot: number; buyer: string | null; assignment: string | null }>; giveaway?: { prize: string; winner: string } | null };

const supabase = createClient();

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'breaker';
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buyerKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
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
  const [buyerAssignment, setBuyerAssignment] = useState('');
  const [spotFilter, setSpotFilter] = useState<SpotFilter>('all');
  const [spotView, setSpotView] = useState<'table' | 'grid'>('table');
  const [tab, setTab] = useState<WorkspaceTab>('breaks');
  const [randomTargets, setRandomTargets] = useState('');
  const [randomizations, setRandomizations] = useState<Randomization[]>([]);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [giveawayPrize, setGiveawayPrize] = useState('Bonus pack');
  const [giveawayMode, setGiveawayMode] = useState<'paid_customers' | 'paid_spots' | 'all_spots'>('paid_customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerHistory, setCustomerHistory] = useState<CustomerSummary[]>([]);
  const [obsToken, setObsToken] = useState('');
  const [obsEnabled, setObsEnabled] = useState(false);

  const activeBreak = useMemo(() => breaks.find((item) => item.id === activeBreakId) ?? null, [breaks, activeBreakId]);
  const latestGiveaway = giveaways[0] ?? null;

  const loadOrganization = useCallback(async (userId: string, userEmail?: string) => {
    const { data: existing, error } = await supabase.from('organizations').select('id,name,slug').eq('owner_id', userId).limit(1).maybeSingle();
    if (error) throw error;
    if (existing) {
      setOrganization(existing);
      return existing as Organization;
    }
    const baseName = userEmail?.split('@')[0] || 'My Breaks';
    const { data: created, error: createError } = await supabase.from('organizations')
      .insert({ owner_id: userId, name: `${baseName} Breaks`, slug: `${slugify(baseName)}-${userId.slice(0, 6)}` })
      .select('id,name,slug').single();
    if (createError) throw createError;
    setOrganization(created);
    return created as Organization;
  }, []);

  const loadNightAndBreaks = useCallback(async (orgId: string) => {
    const { data: latestNight, error: nightError } = await supabase.from('break_nights')
      .select('id,name,status,scheduled_for').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (nightError) throw nightError;
    setNight(latestNight as BreakNight | null);
    if (!latestNight) {
      setBreaks([]); setActiveBreakId(null); setSpots([]); return;
    }
    const { data: breakRows, error: breakError } = await supabase.from('breaks')
      .select('id,sequence_number,title,format,total_spots,price_per_spot,currency,status')
      .eq('break_night_id', latestNight.id).order('sequence_number');
    if (breakError) throw breakError;
    const typed = (breakRows ?? []) as Break[];
    setBreaks(typed);
    setActiveBreakId((current) => current && typed.some((item) => item.id === current) ? current : typed[0]?.id ?? null);
  }, []);

  const loadSpots = useCallback(async (breakId: string | null) => {
    if (!breakId) { setSpots([]); return; }
    const { data, error } = await supabase.from('spots')
      .select('id,spot_number,buyer_name,payment_status,amount_paid,assignment').eq('break_id', breakId).order('spot_number');
    if (error) throw error;
    setSpots((data ?? []) as Spot[]);
  }, []);

  const loadRandomizations = useCallback(async (breakId: string | null) => {
    if (!breakId) { setRandomizations([]); return; }
    const { data, error } = await supabase.from('randomizations')
      .select('id,verification_code,input_snapshot,result_snapshot,created_at').eq('break_id', breakId).order('created_at', { ascending: false });
    if (error) throw error;
    setRandomizations((data ?? []) as Randomization[]);
  }, []);

  const loadGiveaways = useCallback(async (nightId: string | null) => {
    if (!nightId) { setGiveaways([]); return; }
    const { data, error } = await supabase.from('giveaways')
      .select('id,prize,eligible_entries,winner,verification_code,created_at,break_id').eq('break_night_id', nightId).order('created_at', { ascending: false });
    if (error) throw error;
    setGiveaways((data ?? []) as Giveaway[]);
  }, []);

  const loadCustomerHistory = useCallback(async (orgId: string) => {
    const [customerResult, historyResult] = await Promise.all([
      supabase.from('customers').select('id,display_name,handle,notes,created_at').eq('organization_id', orgId).order('display_name'),
      supabase.from('break_nights').select('id,breaks(id,spots(buyer_name,payment_status,amount_paid))').eq('organization_id', orgId),
    ]);
    if (customerResult.error) throw customerResult.error;
    if (historyResult.error) throw historyResult.error;
    setCustomers((customerResult.data ?? []) as Customer[]);

    const summaries = new Map<string, CustomerSummary & { breakIds: Set<string> }>();
    for (const nightRow of historyResult.data ?? []) {
      const relatedBreaks = (nightRow.breaks ?? []) as Array<{ id: string; spots: Array<{ buyer_name: string | null; payment_status: string; amount_paid: number }> }>;
      for (const breakRow of relatedBreaks) {
        for (const spot of breakRow.spots ?? []) {
          if (!spot.buyer_name) continue;
          const key = buyerKey(spot.buyer_name);
          const existing = summaries.get(key) ?? { key, name: spot.buyer_name, totalSpots: 0, paidSpots: 0, totalPaid: 0, breaks: 0, breakIds: new Set<string>() };
          existing.totalSpots += 1;
          existing.totalPaid += Number(spot.amount_paid || 0);
          if (spot.payment_status === 'paid' || spot.payment_status === 'comped') existing.paidSpots += 1;
          existing.breakIds.add(breakRow.id);
          existing.breaks = existing.breakIds.size;
          summaries.set(key, existing);
        }
      }
    }
    setCustomerHistory(Array.from(summaries.values()).map(({ breakIds: _breakIds, ...summary }) => summary).sort((a, b) => b.totalSpots - a.totalSpots));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setOrganization(null); setNight(null); setBreaks([]); setSpots([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const org = await loadOrganization(session.user.id, session.user.email);
        if (!cancelled) await Promise.all([loadNightAndBreaks(org.id), loadCustomerHistory(org.id)]);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not load your dashboard.');
      }
    })();
    return () => { cancelled = true; };
  }, [session, loadOrganization, loadNightAndBreaks, loadCustomerHistory]);

  useEffect(() => {
    Promise.all([loadSpots(activeBreakId), loadRandomizations(activeBreakId)]).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load break data.'));
    if (activeBreakId) {
      const savedToken = localStorage.getItem(`breaker-obs-${activeBreakId}`) ?? '';
      setObsToken(savedToken);
      setObsEnabled(Boolean(savedToken));
    }
  }, [activeBreakId, loadSpots, loadRandomizations]);

  useEffect(() => {
    loadGiveaways(night?.id ?? null).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load giveaways.'));
  }, [night?.id, loadGiveaways]);

  useEffect(() => {
    if (!obsEnabled || !obsToken || !activeBreak) return;
    const channel = supabase.channel(`obs:${obsToken}`);
    const send = () => {
      const snapshot: OverlaySnapshot = {
        breakTitle: activeBreak.title,
        sequence: activeBreak.sequence_number,
        format: formatLabel(activeBreak.format),
        status: activeBreak.status,
        sold: spots.filter((spot) => spot.buyer_name).length,
        total: activeBreak.total_spots,
        spots: spots.map((spot) => ({ spot: spot.spot_number, buyer: spot.buyer_name, assignment: spot.assignment })),
        giveaway: latestGiveaway ? { prize: latestGiveaway.prize, winner: String(latestGiveaway.winner?.name ?? latestGiveaway.winner?.buyer_name ?? '') } : null,
      };
      channel.send({ type: 'broadcast', event: 'overlay', payload: snapshot });
    };
    send();
    const timer = window.setInterval(send, 2500);
    return () => { window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [obsEnabled, obsToken, activeBreak, spots, latestGiveaway]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setMessage('');
    const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : 'Check your email for the magic sign-in link.');
  }

  async function createNight(event: FormEvent) {
    event.preventDefault(); if (!organization) return;
    const { data, error } = await supabase.from('break_nights').insert({ organization_id: organization.id, name: nightName, status: 'live' }).select('id,name,status,scheduled_for').single();
    if (error) return setMessage(error.message);
    setNight(data as BreakNight); setBreaks([]); setSpots([]); setActiveBreakId(null); setMessage('Break night created.');
  }

  async function createBreak(event: FormEvent) {
    event.preventDefault(); if (!night || !breakTitle.trim()) return;
    const sequence = breaks.length ? Math.max(...breaks.map((item) => item.sequence_number)) + 1 : 1;
    const { data: newBreak, error } = await supabase.from('breaks')
      .insert({ break_night_id: night.id, sequence_number: sequence, title: breakTitle.trim(), format: breakFormat, total_spots: spotCount, price_per_spot: spotPrice, status: 'open' })
      .select('id,sequence_number,title,format,total_spots,price_per_spot,currency,status').single();
    if (error) return setMessage(error.message);
    const rows = Array.from({ length: spotCount }, (_, index) => ({ break_id: newBreak.id, spot_number: index + 1 }));
    const { error: spotsError } = await supabase.from('spots').insert(rows);
    if (spotsError) return setMessage(spotsError.message);
    setBreaks((current) => [...current, newBreak as Break]); setActiveBreakId(newBreak.id); setBreakTitle(''); setMessage(`Break #${sequence} created with ${spotCount} spots.`);
  }

  async function ensureCustomer(name: string) {
    if (!organization) return;
    const displayName = name.trim();
    const { data: existing } = await supabase.from('customers').select('id').eq('organization_id', organization.id).ilike('display_name', displayName).limit(1).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from('customers').insert({ organization_id: organization.id, display_name: displayName });
      if (error && !error.message.toLowerCase().includes('duplicate')) throw error;
    }
  }

  function nextOpenSpot(after = 0) {
    return spots.find((spot) => spot.spot_number > after && !spot.buyer_name)?.spot_number ?? spots.find((spot) => !spot.buyer_name)?.spot_number ?? 1;
  }

  async function assignBuyer(event: FormEvent) {
    event.preventDefault();
    const target = spots.find((spot) => spot.spot_number === buyerSpot);
    if (!target || !buyerName.trim()) return;
    try {
      await ensureCustomer(buyerName);
      const assignment = activeBreak?.format === 'pick_your_team' ? buyerAssignment.trim() || null : target.assignment;
      const { error } = await supabase.from('spots').update({ buyer_name: buyerName.trim(), assignment }).eq('id', target.id);
      if (error) throw error;
      setSpots((current) => current.map((spot) => spot.id === target.id ? { ...spot, buyer_name: buyerName.trim(), assignment } : spot));
      setBuyerName(''); setBuyerAssignment(''); setBuyerSpot(nextOpenSpot(target.spot_number));
      if (organization) loadCustomerHistory(organization.id).catch(() => undefined);
      setMessage(`Assigned spot ${target.spot_number}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not assign buyer.'); }
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

  async function updateAssignment(spot: Spot, assignment: string) {
    const next = assignment.trim() || null;
    const { error } = await supabase.from('spots').update({ assignment: next }).eq('id', spot.id);
    if (error) return setMessage(error.message);
    setSpots((current) => current.map((item) => item.id === spot.id ? { ...item, assignment: next } : item));
  }

  async function updateBreakStatus(status: BreakStatus) {
    if (!activeBreak) return;
    const { error } = await supabase.from('breaks').update({ status }).eq('id', activeBreak.id);
    if (error) return setMessage(error.message);
    setBreaks((current) => current.map((item) => item.id === activeBreak.id ? { ...item, status } : item));
    setMessage(`Break #${activeBreak.sequence_number} marked ${status}.`);
  }

  function loadPreset(name: string) {
    setRandomTargets((TEAM_PRESETS[name] ?? []).join('\n'));
  }

  async function runRandomizer() {
    if (!activeBreak) return;
    const participants = spots.filter((spot) => spot.buyer_name);
    if (!participants.length) return setMessage('Add buyers before randomizing.');
    if (randomizations.length && !window.confirm('This break already has a saved randomization. Create a clearly logged rerun?')) return;
    let targets = lines(randomTargets);
    if (activeBreak.format === 'random_spots') targets = participants.map((_, index) => `Position ${index + 1}`);
    if (targets.length < participants.length) return setMessage(`Need at least ${participants.length} randomizer targets for ${participants.length} filled spots.`);
    const shuffled = secureShuffle(targets).slice(0, participants.length);
    const results = participants.map((spot, index) => ({ spot_number: spot.spot_number, buyer_name: spot.buyer_name, assignment: shuffled[index] }));
    const code = verificationCode('RND', activeBreak.sequence_number);
    try {
      const updateResults = await Promise.all(results.map((result) => supabase.from('spots').update({ assignment: result.assignment }).eq('id', participants.find((spot) => spot.spot_number === result.spot_number)!.id)));
      const failedUpdate = updateResults.find((result) => result.error);
      if (failedUpdate?.error) throw failedUpdate.error;
      const { error: auditError } = await supabase.from('randomizations').insert({
        break_id: activeBreak.id,
        verification_code: code,
        input_snapshot: { version: 1, format: activeBreak.format, participants: participants.map((spot) => ({ spot_number: spot.spot_number, buyer_name: spot.buyer_name })), targets, rerun: randomizations.length > 0 },
        result_snapshot: { results },
      });
      if (auditError) throw auditError;
      setSpots((current) => current.map((spot) => results.find((result) => result.spot_number === spot.spot_number) ? { ...spot, assignment: results.find((result) => result.spot_number === spot.spot_number)!.assignment } : spot));
      await updateBreakStatus('randomized');
      await loadRandomizations(activeBreak.id);
      setMessage(`Randomization saved: ${code}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Randomization failed.'); }
  }

  async function runGiveaway() {
    if (!activeBreak || !night || !giveawayPrize.trim()) return;
    const filled = spots.filter((spot) => spot.buyer_name);
    let entries: Array<{ name: string; spot_number?: number }> = [];
    if (giveawayMode === 'all_spots') entries = filled.map((spot) => ({ name: spot.buyer_name!, spot_number: spot.spot_number }));
    if (giveawayMode === 'paid_spots') entries = filled.filter((spot) => spot.payment_status === 'paid' || spot.payment_status === 'comped').map((spot) => ({ name: spot.buyer_name!, spot_number: spot.spot_number }));
    if (giveawayMode === 'paid_customers') {
      const unique = new Map<string, { name: string }>();
      for (const spot of filled.filter((item) => item.payment_status === 'paid' || item.payment_status === 'comped')) unique.set(buyerKey(spot.buyer_name!), { name: spot.buyer_name! });
      entries = Array.from(unique.values());
    }
    const winner = securePick(entries);
    if (!winner) return setMessage('No eligible giveaway entries for that rule.');
    const code = verificationCode('GW', activeBreak.sequence_number);
    const { error } = await supabase.from('giveaways').insert({ break_night_id: night.id, break_id: activeBreak.id, prize: giveawayPrize.trim(), eligible_entries: entries, winner, verification_code: code });
    if (error) return setMessage(error.message);
    await loadGiveaways(night.id);
    setMessage(`${winner.name} won ${giveawayPrize}. Saved as ${code}.`);
  }

  function enableObs() {
    if (!activeBreak) return;
    const token = obsToken || randomOverlayToken();
    localStorage.setItem(`breaker-obs-${activeBreak.id}`, token);
    setObsToken(token); setObsEnabled(true); setMessage('OBS overlay enabled. Keep this dashboard open while streaming.');
  }

  function disableObs() {
    if (activeBreakId) localStorage.removeItem(`breaker-obs-${activeBreakId}`);
    setObsEnabled(false); setObsToken('');
  }

  function openObs() {
    if (!obsToken) return;
    window.open(`${window.location.origin}/obs?channel=${encodeURIComponent(obsToken)}`, '_blank', 'noopener,noreferrer');
  }

  async function copyObsUrl() {
    if (!obsToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/obs?channel=${encodeURIComponent(obsToken)}`);
    setMessage('OBS browser-source URL copied.');
  }

  const soldSpots = spots.filter((spot) => Boolean(spot.buyer_name)).length;
  const openSpots = spots.length - soldSpots;
  const paidCount = spots.filter((spot) => spot.payment_status === 'paid' || spot.payment_status === 'comped').length;
  const unpaidCount = spots.filter((spot) => spot.buyer_name && spot.payment_status === 'unpaid').length;
  const paidRevenue = spots.reduce((sum, spot) => sum + Number(spot.amount_paid || 0), 0);
  const expectedRevenue = activeBreak ? soldSpots * Number(activeBreak.price_per_spot) : 0;
  const outstanding = Math.max(0, expectedRevenue - paidRevenue);
  const duplicateHint = buyerName.trim() ? spots.filter((spot) => spot.buyer_name && buyerKey(spot.buyer_name) === buyerKey(buyerName)).length : 0;
  const filteredSpots = useMemo(() => spots.filter((spot) => {
    if (spotFilter === 'open') return !spot.buyer_name;
    if (spotFilter === 'unpaid') return Boolean(spot.buyer_name) && spot.payment_status === 'unpaid';
    if (spotFilter === 'paid') return Boolean(spot.buyer_name) && (spot.payment_status === 'paid' || spot.payment_status === 'comped');
    return true;
  }), [spots, spotFilter]);

  if (loading) return <main className="shell"><p className="muted">Loading dashboard…</p></main>;
  if (!session) return (
    <main className="authShell"><section className="authCard"><div className="brandMark">BD</div><p className="eyebrow">Breaker Dashboard</p><h1>Your live break command center.</h1><p className="muted">Manage spots, buyers, payments, randoms and giveaways without juggling spreadsheets during a stream.</p><form className="formStack" onSubmit={signIn}><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="breaker@example.com" /></label><button className="primary" type="submit">Send magic link</button></form>{message ? <p className="notice">{message}</p> : null}</section></main>
  );

  return (
    <main className="appShell">
      <aside className="sideNav">
        <div className="brandMark small">BD</div>
        <nav aria-label="Workspace navigation">
          {(['breaks','randoms','giveaways','history'] as WorkspaceTab[]).map((item) => <button key={item} className={`navItem ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{formatLabel(item)}</button>)}
        </nav>
        <button className="navItem signOut" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>
      <div className="mainPane">
        <header className="appHeader"><div><p className="eyebrow">{organization?.name ?? 'Breaker Dashboard'}</p><h1>{night?.name ?? 'Create your first break night'}</h1><p className="muted">Live workspace · {session.user.email}</p></div>{night ? <span className={`nightPill ${night.status}`}>{night.status}</span> : null}</header>

        {!night ? <section className="panel emptyState"><p className="eyebrow">First setup</p><h2>Start a break night</h2><p className="muted">A break night groups all breaks, buyers, randomizations and giveaways from one stream.</p><form className="inlineForm" onSubmit={createNight}><label>Night name<input value={nightName} onChange={(event) => setNightName(event.target.value)} /></label><button className="primary" type="submit">Create break night</button></form></section> : (
          <>
            <section className="metrics metricsFour"><article><span>Breaks tonight</span><strong>{breaks.length}</strong><small>in this stream</small></article><article><span>Spots sold</span><strong>{soldSpots}<i>/{activeBreak?.total_spots ?? 0}</i></strong><small>{openSpots} open</small></article><article><span>Payments</span><strong>{paidCount}<i> paid</i></strong><small>{unpaidCount} unpaid</small></article><article><span>Collected</span><strong>€{paidRevenue.toFixed(2)}</strong><small>€{outstanding.toFixed(2)} outstanding</small></article></section>

            {tab === 'breaks' ? <>
              <section className="panel createPanel"><div className="sectionTitle"><div><p className="eyebrow">Tonight&apos;s queue</p><h2>Add a break</h2></div><span>{breaks.length} configured</span></div><form className="createBreakForm" onSubmit={createBreak}><label>Set / product<input required value={breakTitle} onChange={(event) => setBreakTitle(event.target.value)} placeholder="2026 Topps Chrome Baseball" /></label><label>Format<select value={breakFormat} onChange={(event) => setBreakFormat(event.target.value)}><option value="random_teams">Random Teams</option><option value="pick_your_team">Pick Your Team</option><option value="random_divisions">Random Divisions</option><option value="random_spots">Random Spots</option></select></label><label>Spots<input type="number" min="1" max="500" value={spotCount} onChange={(event) => setSpotCount(Number(event.target.value))} /></label><label>Price<input type="number" min="0" step="0.01" value={spotPrice} onChange={(event) => setSpotPrice(Number(event.target.value))} /></label><button className="primary" type="submit">+ Add</button></form></section>
              <section className="panel"><div className="sectionTitle"><h2>Break queue</h2><span>Select one to manage</span></div><div className="breakList">{breaks.map((item) => <button className={`breakRow ${item.id === activeBreakId ? 'active' : ''}`} key={item.id} onClick={() => setActiveBreakId(item.id)}><span><b>#{item.sequence_number} · {item.title}</b><em>{formatLabel(item.format)}</em></span><span className="right"><b>{item.total_spots} spots</b><em>{item.status} · €{Number(item.price_per_spot).toFixed(2)}</em></span></button>)}</div></section>
              {activeBreak ? <section className="workspace"><article className="panel"><div className="breakHero"><div><p className="eyebrow">Active break #{activeBreak.sequence_number}</p><h2>{activeBreak.title}</h2><p className="muted">{formatLabel(activeBreak.format)} · {activeBreak.total_spots} spots · €{Number(activeBreak.price_per_spot).toFixed(2)}/spot</p></div><select className="statusSelect" value={activeBreak.status} onChange={(event) => updateBreakStatus(event.target.value as BreakStatus)}><option value="open">Open</option><option value="full">Full</option><option value="randomized">Randomized</option><option value="completed">Completed</option></select></div>
                <form className="assignForm" onSubmit={assignBuyer}><label>Buyer<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="CardKing22" />{duplicateHint ? <small className="fieldHint">Already has {duplicateHint} spot{duplicateHint === 1 ? '' : 's'} in this break.</small> : null}</label><label>Spot<input type="number" min="1" max={activeBreak.total_spots} value={buyerSpot} onChange={(event) => setBuyerSpot(Number(event.target.value))} /></label>{activeBreak.format === 'pick_your_team' ? <label>Team<input value={buyerAssignment} onChange={(event) => setBuyerAssignment(event.target.value)} placeholder="Yankees" /></label> : null}<button className="secondary" type="submit">Assign</button></form>
                <div className="spotToolbar"><div className="segmented">{(['all','open','unpaid','paid'] as SpotFilter[]).map((filter) => <button key={filter} className={spotFilter === filter ? 'active' : ''} onClick={() => setSpotFilter(filter)}>{formatLabel(filter)}</button>)}</div><div className="segmented"><button className={spotView === 'table' ? 'active' : ''} onClick={() => setSpotView('table')}>List</button><button className={spotView === 'grid' ? 'active' : ''} onClick={() => setSpotView('grid')}>Grid</button></div></div>
                {spotView === 'table' ? <div className="table"><div className="tr head"><span>Spot</span><span>Buyer</span><span>Payment</span><span>Assignment</span><span></span></div>{filteredSpots.map((spot) => <div className="tr" key={spot.id}><span>{String(spot.spot_number).padStart(2, '0')}</span><span>{spot.buyer_name ?? <em className="muted">Open</em>}</span><span>{spot.buyer_name ? <select className={`paymentSelect ${spot.payment_status}`} value={spot.payment_status} onChange={(event) => updatePayment(spot, event.target.value as PaymentStatus)}><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="comped">Comped</option></select> : '—'}</span><span>{spot.buyer_name ? <input className="inlineInput" defaultValue={spot.assignment ?? ''} key={`${spot.id}-${spot.assignment ?? ''}`} onBlur={(event) => updateAssignment(spot, event.target.value)} placeholder={activeBreak.format === 'pick_your_team' ? 'Team' : '—'} /> : '—'}</span><span>{spot.buyer_name ? <button className="iconButton" title="Clear buyer" onClick={() => clearBuyer(spot)}>×</button> : null}</span></div>)}</div> : <div className="spotGrid">{filteredSpots.map((spot) => <button key={spot.id} className={`spotCard ${spot.buyer_name ? spot.payment_status : 'open'}`} onClick={() => { setBuyerSpot(spot.spot_number); if (spot.buyer_name && activeBreak.format === 'pick_your_team') setMessage(`${spot.buyer_name}: ${spot.assignment ?? 'No team assigned'}`); }}><b>#{spot.spot_number}</b><span>{spot.buyer_name ?? 'Open'}</span><small>{spot.assignment ?? (spot.buyer_name ? formatLabel(spot.payment_status) : 'Available')}</small></button>)}</div>}
              </article><aside className="stack toolStack"><article className="panel action"><p className="eyebrow">Randomizer</p><h3>{randomizations.length ? `${randomizations.length} saved result${randomizations.length === 1 ? '' : 's'}` : 'Ready when full'}</h3><p className="muted">Use presets or paste your own team/division list.</p><div className="presetRow">{Object.keys(TEAM_PRESETS).map((preset) => <button key={preset} className="miniButton" onClick={() => loadPreset(preset)}>{preset}</button>)}</div><textarea value={randomTargets} onChange={(event) => setRandomTargets(event.target.value)} placeholder="One team / division per line" rows={6} /><button className="primary wide" onClick={runRandomizer}>Run randomizer</button>{randomizations[0] ? <small className="auditCode">Latest: {randomizations[0].verification_code}</small> : null}</article>
              <article className="panel action"><p className="eyebrow">Giveaway</p><h3>Pick a saved winner</h3><input value={giveawayPrize} onChange={(event) => setGiveawayPrize(event.target.value)} placeholder="Prize" /><select value={giveawayMode} onChange={(event) => setGiveawayMode(event.target.value as typeof giveawayMode)}><option value="paid_customers">Paid customers · one entry each</option><option value="paid_spots">Paid spots · each spot an entry</option><option value="all_spots">All filled spots</option></select><button className="secondary wide" onClick={runGiveaway}>Pick winner</button>{latestGiveaway ? <small className="auditCode">Latest: {String(latestGiveaway.winner?.name ?? '')} · {latestGiveaway.verification_code}</small> : null}</article>
              <article className="panel action"><p className="eyebrow">OBS overlay</p><h3>{obsEnabled ? 'Broadcasting' : 'Not connected'}</h3><p className="muted">A private random channel URL receives live break state while this dashboard stays open.</p>{obsEnabled ? <div className="buttonStack"><button className="secondary wide" onClick={openObs}>Open preview</button><button className="secondary wide" onClick={copyObsUrl}>Copy browser-source URL</button><button className="ghost wide" onClick={disableObs}>Disable</button></div> : <button className="secondary wide" onClick={enableObs}>Enable OBS overlay</button>}</article></aside></section> : null}
            </> : null}

            {tab === 'randoms' ? <section className="panel"><div className="sectionTitle"><div><p className="eyebrow">Audit history</p><h2>Randomizations</h2></div><span>{activeBreak ? `Break #${activeBreak.sequence_number}` : 'Select a break'}</span></div>{randomizations.length ? <div className="historyList">{randomizations.map((random) => <article key={random.id}><b>{random.verification_code}</b><span>{new Date(random.created_at).toLocaleString()}</span><small>{Array.isArray((random.result_snapshot as { results?: unknown[] }).results) ? (random.result_snapshot as { results: unknown[] }).results.length : 0} assignments</small></article>)}</div> : <p className="muted">No saved randomizations for this break yet.</p>}</section> : null}

            {tab === 'giveaways' ? <section className="panel"><div className="sectionTitle"><div><p className="eyebrow">Audit history</p><h2>Giveaways</h2></div><span>{giveaways.length} saved</span></div>{giveaways.length ? <div className="historyList">{giveaways.map((giveaway) => <article key={giveaway.id}><b>{giveaway.prize}</b><span>Winner: {String(giveaway.winner?.name ?? 'Unknown')}</span><small>{giveaway.verification_code} · {new Date(giveaway.created_at).toLocaleString()}</small></article>)}</div> : <p className="muted">No giveaways saved for this break night yet.</p>}</section> : null}

            {tab === 'history' ? <section className="panel"><div className="sectionTitle"><div><p className="eyebrow">Buyer CRM</p><h2>Customer history</h2></div><span>{customers.length} saved customers · {customerHistory.length} with break activity</span></div><div className="customerTable"><div className="customerRow head"><span>Customer</span><span>Spots</span><span>Breaks</span><span>Paid spots</span><span>Total paid</span></div>{customerHistory.map((customer) => <div className="customerRow" key={customer.key}><span><b>{customer.name}</b></span><span>{customer.totalSpots}</span><span>{customer.breaks}</span><span>{customer.paidSpots}</span><span>€{customer.totalPaid.toFixed(2)}</span></div>)}</div>{!customerHistory.length ? <p className="muted">Buyer history will populate as you assign spots.</p> : null}</section> : null}
          </>
        )}
        {message ? <div className="toast" role="status">{message}</div> : null}
      </div>
    </main>
  );
}
