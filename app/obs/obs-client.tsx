'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type OverlaySnapshot = {
  breakTitle: string;
  sequence: number;
  format: string;
  status: string;
  sold: number;
  total: number;
  spots: Array<{ spot: number; buyer: string | null; assignment: string | null }>;
  giveaway?: { prize: string; winner: string } | null;
};

const supabase = createClient();

export default function ObsClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('channel');
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const channel = supabase
      .channel(`obs:${token}`)
      .on('broadcast', { event: 'overlay' }, ({ payload }) => setSnapshot(payload as OverlaySnapshot))
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, [token]);

  if (!token) return <main className="obsWaiting"><p>Missing overlay channel.</p></main>;
  if (!snapshot) return <main className="obsWaiting"><p>{connected ? 'Connected · waiting for dashboard data…' : 'Connecting to breaker dashboard…'}</p></main>;

  const assigned = snapshot.spots.filter((spot) => spot.buyer && spot.assignment).slice(0, 8);
  return (
    <main className="obsCanvas">
      <section className="obsPanel">
        <div className="obsHeader"><div><small>BREAK #{snapshot.sequence}</small><h1>{snapshot.breakTitle}</h1><p>{snapshot.format}</p></div><div className="obsCounter"><b>{snapshot.sold}/{snapshot.total}</b><span>{snapshot.status}</span></div></div>
        {assigned.length ? <div className="obsAssignments">{assigned.map((spot) => <div key={spot.spot}><b>#{spot.spot} {spot.buyer}</b><span>{spot.assignment}</span></div>)}</div> : <p className="obsEmpty">Waiting for assignments…</p>}
        {snapshot.giveaway?.winner ? <div className="obsGiveaway"><small>GIVEAWAY · {snapshot.giveaway.prize}</small><b>{snapshot.giveaway.winner}</b></div> : null}
      </section>
    </main>
  );
}
