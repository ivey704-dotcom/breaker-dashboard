const sampleBreaks = [
  { id: 201, name: "2026 Topps Chrome Baseball", sold: 30, total: 30, status: "Ready" },
  { id: 202, name: "Prizm Football", sold: 27, total: 32, status: "5 left" },
  { id: 203, name: "Select Basketball", sold: 18, total: 30, status: "12 left" },
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Break night</p>
          <h1>Breaker Dashboard</h1>
          <p className="muted">Run tonight's breaks from one place.</p>
        </div>
        <button className="primary">+ Create break</button>
      </header>

      <section className="metrics">
        <article><span>Tonight's breaks</span><strong>5</strong></article>
        <article><span>Spots sold</span><strong>92 / 152</strong></article>
        <article><span>Paid revenue</span><strong>€3,840</strong></article>
      </section>

      <section className="panel">
        <div className="sectionTitle"><h2>Breaks</h2><span>Live workspace</span></div>
        <div className="breakList">
          {sampleBreaks.map((item) => (
            <button className="breakRow" key={item.id}>
              <span><b>#{item.id}</b><em>{item.name}</em></span>
              <span className="right"><b>{item.sold}/{item.total}</b><em>{item.status}</em></span>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <article className="panel">
          <p className="eyebrow">Break #201</p>
          <h2>2026 Topps Chrome Baseball</h2>
          <p className="muted">Random Teams · 30 spots · €45/spot</p>
          <div className="table">
            <div className="tr head"><span>Spot</span><span>Buyer</span><span>Payment</span><span>Team</span></div>
            <div className="tr"><span>01</span><span>CardKing22</span><span className="paid">Paid</span><span>—</span></div>
            <div className="tr"><span>02</span><span>MikeCards</span><span className="paid">Paid</span><span>—</span></div>
            <div className="tr"><span>03</span><span>JoshBreaks</span><span className="unpaid">Unpaid</span><span>—</span></div>
          </div>
        </article>

        <aside className="stack">
          <article className="panel action"><p className="eyebrow">Randomizer</p><h3>Random teams</h3><p className="muted">Results will be locked with a verification record.</p><button className="primary wide">Randomize teams</button></article>
          <article className="panel action"><p className="eyebrow">Giveaway</p><h3>Pick a winner</h3><p className="muted">Choose from eligible paid customers.</p><button className="secondary wide">Run giveaway</button></article>
          <article className="panel action"><p className="eyebrow">Livestream</p><h3>OBS overlay</h3><p className="muted">Viewer-facing break status and results.</p><button className="secondary wide">Show on OBS</button></article>
        </aside>
      </section>
    </main>
  );
}
