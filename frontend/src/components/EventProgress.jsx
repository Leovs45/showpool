export default function EventProgress({ show, targetRevenue, label }) {
  const interest = show.interest_count ?? 0;
  const min = show.min_attendees;
  const capacity = show.venue_capacity;
  const pct = Math.min(100, (interest / min) * 100);
  const confirmed = show.status === 'confirmed' || show.status === 'funded';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>}
      <div className="progress-wrap">
        <div
          className={`progress-bar ${confirmed ? 'green' : 'accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>{interest.toLocaleString()} interesados</span>
        <span>mín. {min.toLocaleString()} · aforo {capacity.toLocaleString()}</span>
      </div>
    </div>
  );
}
