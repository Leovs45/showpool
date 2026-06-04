import { useState, useEffect } from 'react';

export default function PriceSimulator({ eventId, showId, currentPrice }) {
  const [maxPrice, setMaxPrice] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!maxPrice || isNaN(Number(maxPrice)) || Number(maxPrice) <= 0) {
      setResult(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/events/${eventId}/simulate?show_id=${showId}&max_price=${maxPrice}&desired_price=${maxPrice}`
        );
        const data = await res.json();
        setResult(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [maxPrice, eventId, showId]);

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
        Simulador de precio
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        ¿Cuánto estás dispuesto a pagar como máximo? Mirá cómo afecta el precio actual.
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>$</span>
        <input
          className="form-input"
          type="number"
          min="1"
          step="0.01"
          placeholder="tu precio máximo"
          value={maxPrice}
          onChange={e => setMaxPrice(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Calculando...</div>
      )}

      {result && !loading && (
        <div>
          {result.qualifies ? (
            <div className="alert alert-success" style={{ fontSize: 13 }}>
              {result.message}
              {result.simulated_clearing_price && currentPrice && result.simulated_clearing_price < currentPrice && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  Precio actual: ${currentPrice?.toFixed(2)} → con vos: ${result.simulated_clearing_price?.toFixed(2)}
                </div>
              )}
            </div>
          ) : (
            <div className="alert alert-warn" style={{ fontSize: 13 }}>
              {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
