import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EventCard from '../components/EventCard';

export default function Home() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/events')
      .then(r => r.json())
      .then(data => { setEvents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? events : events.filter(e => e.status === filter);

  return (
    <main style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div className="container">
        {/* Hero */}
        <div style={{ marginBottom: 48, maxWidth: 600 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1, marginBottom: 16 }}>
            Traé el show que querés{' '}
            <span style={{ color: 'var(--accent)' }}>entre todos</span>.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Expresá tu interés en un evento. Si hay suficiente gente dispuesta a pagar,
            el artista viene. Cuanta más gente se suma, más baja el precio.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Todos' },
            { key: 'open', label: 'Abiertos' },
            { key: 'confirmed', label: 'Confirmados' },
            { key: 'funded', label: 'Cerrados' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              {f.label}
            </button>
          ))}
          <Link to="/create" className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}>
            + Crear evento
          </Link>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Cargando eventos...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>
            No hay eventos en esta categoría.
          </div>
        ) : (
          <div className="events-grid">
            {filtered.map(event => <EventCard key={event.id} event={event} />)}
          </div>
        )}
      </div>
    </main>
  );
}
