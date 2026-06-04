import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DEFAULT_MARGIN = 0.15;

function ShowRow({ show, index, onChange, onRemove, canRemove }) {
  const set = (k, v) => onChange(index, { ...show, [k]: v });
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Fecha {index + 1}</div>
        {canRemove && (
          <button type="button" onClick={() => onRemove(index)} style={{ background: 'none', color: 'var(--text-dim)', fontSize: 18, lineHeight: 1 }}>×</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">Fecha del show</label>
          <input className="form-input" type="date" required value={show.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Nombre del venue</label>
          <input className="form-input" required value={show.venue_name} onChange={e => set('venue_name', e.target.value)} placeholder="Estadio River Plate" />
        </div>
        <div className="form-group">
          <label className="form-label">Capacidad del venue</label>
          <input className="form-input" type="number" required min="1" value={show.venue_capacity} onChange={e => set('venue_capacity', Number(e.target.value))} placeholder="5000" />
        </div>
        <div className="form-group">
          <label className="form-label">Mínimo viable</label>
          <input className="form-input" type="number" required min="1" value={show.min_attendees} onChange={e => set('min_attendees', Number(e.target.value))} placeholder="3000" />
          <span className="form-hint">Mínimo de personas para confirmar esta fecha</span>
        </div>
      </div>
    </div>
  );
}

function parseFeeSchedule(text) {
  try {
    const lines = text.trim().split('\n').filter(Boolean);
    const obj = {};
    for (const line of lines) {
      const [k, v] = line.split(':').map(x => x.trim());
      if (k && v) obj[k] = Number(v.replace(/[^0-9.]/g, ''));
    }
    if (Object.keys(obj).length > 0) return obj;
  } catch {}
  return null;
}

export default function CreateEvent() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '', artist: '', description: '', city: '',
    cost_per_show: '',
    profit_margin: DEFAULT_MARGIN,
    deadline: '',
    creator_name: '', creator_email: '',
    fee_schedule_text: '1: 50000\n2: 70000',
  });
  const [shows, setShows] = useState([
    { date: '', venue_name: '', venue_capacity: '', min_attendees: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addShow = () => setShows(s => [...s, { date: '', venue_name: '', venue_capacity: '', min_attendees: '' }]);
  const updateShow = (i, val) => setShows(s => s.map((x, idx) => idx === i ? val : x));
  const removeShow = (i) => setShows(s => s.filter((_, idx) => idx !== i));

  // Preview price calculation
  const feeSchedule = parseFeeSchedule(form.fee_schedule_text);
  const nShows = shows.length;
  const feeForN = feeSchedule?.[String(nShows)] ?? null;
  const costPerShow = Number(form.cost_per_show) || 0;
  const totalCost = feeForN != null ? feeForN + costPerShow * nShows : null;
  const totalRevenue = totalCost != null ? totalCost * (1 + form.profit_margin) : null;
  const revenuePerShow = totalRevenue != null ? totalRevenue / nShows : null;
  const firstShow = shows[0];
  const priceAtMin = revenuePerShow && firstShow?.min_attendees ? (revenuePerShow / Number(firstShow.min_attendees)).toFixed(2) : null;
  const priceAtCapacity = revenuePerShow && firstShow?.venue_capacity ? (revenuePerShow / (Number(firstShow.venue_capacity) * 1.10)).toFixed(2) : null;

  const submit = async (e) => {
    e.preventDefault();
    const schedule = parseFeeSchedule(form.fee_schedule_text);
    if (!schedule) { setError('El formato del fee schedule no es válido. Usá "1: 50000" por línea.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          artist: form.artist,
          description: form.description,
          city: form.city,
          artist_fee_schedule: schedule,
          cost_per_show: Number(form.cost_per_show),
          profit_margin: Number(form.profit_margin),
          deadline: form.deadline,
          creator_name: form.creator_name,
          creator_email: form.creator_email,
          shows: shows.map(s => ({
            date: s.date,
            venue_name: s.venue_name,
            venue_capacity: Number(s.venue_capacity),
            min_attendees: Number(s.min_attendees),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      navigate(`/events/${data.id}`);
    } catch (err) {
      setError('Error de red, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <a href="/" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-flex', gap: 4, marginBottom: 28 }}>← Volver</a>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>Crear evento</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, marginBottom: 32 }}>
          Completá los datos del artista, las fechas y los costos. Nosotros calculamos el precio dinámico.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Basic info */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Información del evento</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Nombre del evento</label>
                <input className="form-input" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="Radiohead en Buenos Aires" />
              </div>
              <div className="form-group">
                <label className="form-label">Artista / Banda</label>
                <input className="form-input" required value={form.artist} onChange={e => set('artist', e.target.value)} placeholder="Radiohead" />
              </div>
              <div className="form-group">
                <label className="form-label">Ciudad</label>
                <input className="form-input" required value={form.city} onChange={e => set('city', e.target.value)} placeholder="Buenos Aires" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describí el evento..." style={{ resize: 'vertical' }} />
              </div>
            </div>
          </section>

          <div className="divider" />

          {/* Costs */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Costos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Fee del artista por número de fechas</label>
                <textarea
                  className="form-input"
                  rows={3}
                  required
                  value={form.fee_schedule_text}
                  onChange={e => set('fee_schedule_text', e.target.value)}
                  placeholder={'1: 50000\n2: 70000\n3: 80000'}
                  style={{ fontFamily: 'monospace', resize: 'vertical' }}
                />
                <span className="form-hint">Un par "cantidad de fechas: costo total en USD" por línea. Ej: 2 fechas cuestan $70.000 (no $100.000).</span>
              </div>
              <div className="form-group">
                <label className="form-label">Costo fijo por fecha (USD)</label>
                <input className="form-input" type="number" min="0" required value={form.cost_per_show} onChange={e => set('cost_per_show', e.target.value)} placeholder="5000" />
                <span className="form-hint">Producción, venue, sonido, etc.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Margen de ganancia</label>
                <select className="form-input" value={form.profit_margin} onChange={e => set('profit_margin', Number(e.target.value))}>
                  <option value={0.05}>5% — bajo</option>
                  <option value={0.10}>10%</option>
                  <option value={0.15}>15% — típico de industria</option>
                  <option value={0.20}>20%</option>
                  <option value={0.25}>25%</option>
                  <option value={0.30}>30% — alto</option>
                </select>
                <span className="form-hint">El margen típico para eventos de este tipo es 10–20%.</span>
              </div>
            </div>

            {/* Price preview */}
            {revenuePerShow != null && (
              <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 'var(--radius-sm)', padding: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>Vista previa de precios (con {nShows} fecha{nShows > 1 ? 's' : ''})</div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: 'var(--text)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Revenue total necesario</div>
                    <div style={{ fontWeight: 700 }}>${totalRevenue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Por fecha</div>
                    <div style={{ fontWeight: 700 }}>${revenuePerShow?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  {priceAtMin && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Precio si llega al mínimo</div>
                      <div style={{ fontWeight: 700, color: 'var(--accent)' }}>${priceAtMin}</div>
                    </div>
                  )}
                  {priceAtCapacity && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Precio si llena el aforo</div>
                      <div style={{ fontWeight: 700, color: 'var(--green)' }}>${priceAtCapacity}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <div className="divider" />

          {/* Shows */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fechas del evento</div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addShow}>+ Agregar fecha</button>
            </div>
            {shows.map((show, i) => (
              <ShowRow key={i} show={show} index={i} onChange={updateShow} onRemove={removeShow} canRemove={shows.length > 1} />
            ))}
          </section>

          <div className="divider" />

          {/* Deadline & creator */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cierre y organizador</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Fecha límite de participación</label>
                <input className="form-input" type="date" required value={form.deadline} onChange={e => set('deadline', e.target.value)} />
                <span className="form-hint">Al llegar esta fecha se cierran las inscripciones, se calcula el precio final y se procesan los cobros.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Tu nombre</label>
                <input className="form-input" required value={form.creator_name} onChange={e => set('creator_name', e.target.value)} placeholder="Matías Fernández" />
              </div>
              <div className="form-group">
                <label className="form-label">Tu email</label>
                <input className="form-input" type="email" required value={form.creator_email} onChange={e => set('creator_email', e.target.value)} placeholder="matias@mail.com" />
              </div>
            </div>
          </section>

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start', fontSize: 15, padding: '12px 28px' }}>
            {loading ? 'Creando...' : 'Crear evento'}
          </button>
        </form>
      </div>
    </main>
  );
}
