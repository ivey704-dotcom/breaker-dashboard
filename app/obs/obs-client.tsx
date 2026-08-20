'use client';

import { useEffect, useMemo, useState } from 'react';
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

  const assigned = useMemo(() => snapshot?.spots.filter((spot) => spot.buyer && spot.assignment).slice(0, 10) ?? [], [snapshot]);
  const fillPercent = snapshot?.total ? Math.min(100, Math.round((snapshot.sold / snapshot.total) * 100)) : 0;

  if (!token) return <main className="obsWaiting"><div className="obsWaitingCard"><span className="obsLiveDot" />Missing overlay channel.</div></main>;
  if (!snapshot) return <main className="obsWaiting"><div className="obsWaitingCard"><span className={`obsLiveDot ${connected ? 'online' : ''}`} />{connected ? 'Connected · waiting for break data…' : 'Connecting to breaker dashboard…'}</div></main>;

  return (
    <main className="obsCanvas">
      <section className="obsPanel" aria-label="Live break overlay">
        <div className="obsTopline">
          <div className="obsBrand"><span className="obsBrandMark">BD</span><span>LIVE BREAK</span></div>
          <div className="obsStatus"><span className="obsLiveDot online" />{snapshot.status}</div>
        </div>

        <div className="obsHeader">
          <div className="obsTitleBlock">
            <small>BREAK #{snapshot.sequence}</small>
            <h1>{snapshot.breakTitle}</h1>
            <p>{snapshot.format}</p>
          </div>
          <div className="obsCounter">
            <b>{snapshot.sold}<em>/{snapshot.total}</em></b>
            <span>spots filled</span>
          </div>
        </div>

        <div className="obsProgress" aria-label={`${fillPercent}% filled`}><span style={{ width: `${fillPercent}%` }} /></div>

        <div className="obsBody">
          <div>
            <div className="obsSectionLabel">Assignments</div>
            {assigned.length ? <div className="obsAssignments">{assigned.map((spot) => <div className="obsAssignment" key={spot.spot}><span className="obsSpot">#{String(spot.spot).padStart(2, '0')}</span><b>{spot.buyer}</b><strong>{spot.assignment}</strong></div>)}</div> : <p className="obsEmpty">Assignments will appear here after the random or PYT setup.</p>}
          </div>
        </div>

        {snapshot.giveaway?.winner ? <div className="obsGiveaway"><div><small>GIVEAWAY WINNER</small><span>{snapshot.giveaway.prize}</span></div><b>{snapshot.giveaway.winner}</b></div> : null}
      </section>
    </main>
  );
}
