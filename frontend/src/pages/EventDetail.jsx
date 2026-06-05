import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import EventProgress from '../components/EventProgress';
import PriceSimulator from '../components/PriceSimulator';
import { API_BASE } from '../lib/api';

const STATUS_LABEL = { open: 'Abierto', confirmed: 'Confirmado', funded: 'Cerrado', failed: 'Cancelado' };

function daysLeft(deadline) {
  const diff = new Date(deadline) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Plazo vencido';
  if (days === 0) return 'Último día';
  return `${days} días restantes`;
}

function InterestForm({ eventId, shows, onSuccess }) {
  const [form, setForm] = useState({
    user_name: '', user_email: '',
    desired_price: '', max_price: '',
    payment_placeholder: 'card ending in 4242',
    selectedShows: shows.map(s => s.id),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleShow = (id) => {
    setForm(f => ({
      ...f,
      selectedShows: f.selectedShows.includes(id)
        ? f.selectedShows.filter(x => x !== id)
        : [...f.selectedShows, id],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.selectedShows.length) { setError('Seleccioná al menos una fecha.'); return; }
    setLoading(true); setError(null);
    try {
      const results = [];
      for (const showId of form.selectedShows) {
        const res = await fetch(`${API_BASE}/api/shows/${showId}/interest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_name: form.user_name,
            user_email: form.user_email,
            desired_price: Number(form.desired_price),
            max_price: Number(form.max_price),
            payment_placeholder: form.payment_placeholder,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setLoading(false); return; }
        results.push(data);
      }
      onSuccess(results[results.length - 1]);
    } catch (err) {
      setError('Error de red, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Expresar interés</div>

      {/* Show selector */}
      {shows.length > 1 && (
        <div className="form-group">
          <label className="form-label">¿A qué fecha(s) querés ir?</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shows.map(s => (
              <label key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={form.selectedShows.includes(s.id)}
                  onChange={() => toggleShow(s.id)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                {new Date(s.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' '}— {s.venue_name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Tu nombre</label>
          <input className="form-input" required value={form.user_name} onChange={e => set('user_name', e.target.value)} placeholder="Ana García" />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Email</label>
          <input className="form-input" type="email" required value={form.user_email} onChange={e => set('user_email', e.target.value)} placeholder="ana@mail.com" />
        </div>
        <div className="form-group">
          <label className="form-label">Precio deseado por show</label>
          <input className="form-input" type="number" min="1" step="1" required value={form.desired_price} onChange={e => set('desired_price', e.target.value)} placeholder="$25" />
          <span className="form-hint">Lo que te gustaría pagar idealmente</span>
        </div>
        <div className="form-group">
          <label className="form-label">Precio máximo por show</label>
          <input className="form-input" type="number" min="1" step="1" required value={form.max_price} onChange={e => set('max_price', e.target.value)} placeholder="$40" />
          <span className="form-hint">No pagarás más que esto, nunca</span>
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">
            Método de pago&nbsp;
            <span className="placeholder-tag">simulado</span>
          </label>
          <input className="form-input" value={form.payment_placeholder} onChange={e => set('payment_placeholder', e.target.value)} placeholder="card ending in 4242" />
          <span className="form-hint">Solo se cobra si el evento se confirma y cierra el plazo</span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? 'Registrando...' : 'Confirmar interés'}
      </button>
    </form>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successData, setSuccessData] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [activeSimShow, setActiveSimShow] = useState(null);

  const load = () => {
    fetch(`${API_BASE}/api/events/${id}`)
      .then(r => r.json())
      .then(data => { setEvent(data); setLoading(false); setActiveSimShow(s => s ?? data.shows[0]?.id); })
      .catch(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleSuccess = (data) => {
    setSuccessData(data);
    load();
  };

  const runCheck = async (finalize = false) => {
    setChecking(true);
    const res = await fetch(`${API_BASE}/api/events/${id}/check${finalize ? '?finalize=true' : ''}`, { method: 'POST' });
    const data = await res.json();
    setCheckResult(data.clearing_result);
    load();
    setChecking(false);
  };

  if (loading) return <main style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</main>;
  if (!event) return <main style={{ padding: '80px 0', textAlign: 'center', color: 'var(--red)' }}>Evento no encontrado.</main>;

  const isOpen = ['open', 'confirmed'].includes(event.status);
  const shows = event.shows || [];
  const firstShow = shows[0];
  const simShow = shows.find(s => s.id === activeSimShow) ?? firstShow;

  return (
    <main style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div className="container">
        <Link to="/" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 24 }}>
          ← Volver
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'start' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Header */}
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {event.city}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2, flex: 1 }}>
                  {event.title}
                </h1>
                <span className={`badge badge-${event.status}`}>{STATUS_LABEL[event.status]}</span>
              </div>
              <p style={{ marginTop: 12, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 15 }}>
                {event.description}
              </p>
            </div>

            {/* Confirmed banner */}
            {event.status === 'confirmed' && (
              <div className="alert alert-success">
                <strong>¡Evento confirmado!</strong>{' '}
                {shows.filter(s => s.status === 'confirmed').length} de {shows.length} fecha(s) confirmada(s).
                El precio puede seguir bajando si más gente se suma antes del {' '}
                {new Date(event.deadline).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}.
              </div>
            )}
            {event.status === 'funded' && (
              <div className="alert alert-success">
                <strong>Evento cerrado.</strong> Los cobros están siendo procesados.{' '}
                <span className="placeholder-tag">cobros simulados</span>
              </div>
            )}
            {event.status === 'failed' && (
              <div className="alert alert-error">
                <strong>Evento cancelado.</strong> No se alcanzó el mínimo necesario. Nadie fue cobrado.
              </div>
            )}

            {/* Shows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {shows.length === 1 ? 'Fecha del evento' : `Fechas (${shows.length} potenciales)`}
              </div>
              {shows.map((show, i) => (
                <div key={show.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {new Date(show.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                        {show.venue_name} <span className="placeholder-tag">reserva simulada</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {show.current_clearing_price ? (
                        <>
                          <div style={{ fontSize: 22, fontWeight: 700, color: show.status === 'confirmed' ? 'var(--green)' : 'var(--accent)' }}>
                            ${show.current_clearing_price.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>precio actual</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Sin precio aún</div>
                      )}
                    </div>
                  </div>
                  <EventProgress show={show} />
                </div>
              ))}
            </div>

            {/* Cost info */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Estructura de costos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(event.artist_fee_schedule).map(([n, fee]) => (
                  <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{n} fecha{n > 1 ? 's' : ''} — fee artista</span>
                    <span>${Number(fee).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Costo fijo por fecha (producción)</span>
                  <span>${event.cost_per_show.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Margen de ganancia</span>
                  <span>{(event.profit_margin * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            {/* Admin controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Controles de simulación
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => runCheck(false)} disabled={checking || !isOpen}>
                  {checking ? 'Calculando...' : 'Recalcular clearing'}
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => runCheck(true)} disabled={checking || !isOpen}>
                  Cerrar plazo
                </button>
              </div>
              {checkResult && (
                <div className="alert alert-info" style={{ fontSize: 13 }}>
                  {checkResult.event_viable
                    ? `${checkResult.confirmed_shows_count} show(s) confirmado(s). Revenue por show: $${checkResult.revenue_per_show?.toFixed(2)}`
                    : 'El evento no alcanza el mínimo todavía.'}
                </div>
              )}
            </div>
          </div>

          {/* Right column — sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>
            {/* Deadline */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cierre de participación</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>
                  {new Date(event.deadline).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{daysLeft(event.deadline)}</div>
            </div>

            {/* Simulator */}
            {shows.length > 0 && isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shows.length > 1 && (
                  <div className="form-group">
                    <label className="form-label">Simular para</label>
                    <select className="form-input" value={activeSimShow} onChange={e => setActiveSimShow(Number(e.target.value))}>
                      {shows.map(s => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <PriceSimulator
                  eventId={id}
                  showId={activeSimShow ?? shows[0]?.id}
                  currentPrice={simShow?.current_clearing_price}
                />
              </div>
            )}

            {/* Interest form or success */}
            {isOpen && !successData && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
                <InterestForm eventId={id} shows={shows} onSuccess={handleSuccess} />
              </div>
            )}

            {successData && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="alert alert-success">
                  <strong>¡Listo!</strong> {successData.clearing?.message}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Tu interés fue registrado en {form?.selectedShows?.length ?? 1} show(s).
                  Te avisaremos cuando el evento se confirme.{' '}
                  <span className="placeholder-tag">email simulado</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
