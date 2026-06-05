import { Link } from 'react-router-dom';
import EventProgress from './EventProgress';

const STATUS_LABEL = {
  open: 'Abierto',
  confirmed: 'Confirmado',
  funded: 'Cerrado',
  failed: 'Cancelado',
};

function daysLeft(deadline) {
  const diff = new Date(deadline) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Venció';
  if (days === 0) return 'Hoy';
  return `${days}d restantes`;
}

function bestPrice(shows) {
  const prices = shows.map(s => s.current_clearing_price).filter(Boolean);
  if (!prices.length) return null;
  return Math.min(...prices);
}

export default function EventCard({ event }) {
  const price = bestPrice(event.shows);
  const totalInterests = event.total_interests;
  const showCount = event.shows.length;

  return (
    <Link to={`/events/${event.id}`} style={{ display: 'block', height: '100%' }}>
      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', boxSizing: 'border-box' }}>
        {/* Header — minHeight garantiza que títulos cortos ocupan lo mismo que 2 líneas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minHeight: 60 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {event.city}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{event.title}</div>
          </div>
          <span className={`badge badge-${event.status}`}>{STATUS_LABEL[event.status]}</span>
        </div>

        {/* Fecha(s) */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {event.shows.map(s => (
            <span key={s.id} style={{ background: 'var(--surface2)', padding: '2px 8px', borderRadius: 4 }}>
              {new Date(s.date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
            </span>
          ))}
          {showCount > 1 && <span style={{ color: 'var(--accent)', fontSize: 12, marginLeft: 'auto', alignSelf: 'center' }}>{showCount} fechas</span>}
        </div>

        {/* Precio */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', minHeight: 52 }}>
          {price ? (
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
                ${price.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>precio actual por show</div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Precio a determinar</div>
          )}
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{totalInterests.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>interesados</div>
          </div>
        </div>

        {/* Progress del primer show */}
        {event.shows[0] && (
          <EventProgress show={event.shows[0]} label={event.shows[0].venue_name} />
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: 'var(--text-dim)', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <span>{daysLeft(event.deadline)}</span>
        </div>
      </div>
    </Link>
  );
}
