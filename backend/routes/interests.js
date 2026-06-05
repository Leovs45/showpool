const express = require('express');
const router = express.Router({ mergeParams: true });
const { run, get, all } = require('../db');
const { runClearing } = require('../clearing');
const { applyClearing } = require('./events');

// POST /api/shows/:showId/interest
router.post('/', async (req, res) => {
  try {
    const showId = Number(req.params.showId);
    const { user_name, user_email, desired_price, max_price, payment_placeholder } = req.body;

    if (!user_name || !user_email || !desired_price || !max_price) {
      return res.status(400).json({ error: 'Missing required fields: user_name, user_email, desired_price, max_price' });
    }
    if (max_price <= 0 || desired_price <= 0) {
      return res.status(400).json({ error: 'Prices must be positive' });
    }

    const show = await get(`SELECT * FROM shows WHERE id = ?`, [showId]);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const event = await get(`SELECT * FROM events WHERE id = ?`, [show.event_id]);
    if (['funded', 'failed'].includes(event.status)) {
      return res.status(400).json({ error: `Event is already ${event.status}` });
    }

    // Check for deadline
    const now = new Date();
    const deadline = new Date(event.deadline);
    if (now > deadline) {
      return res.status(400).json({ error: 'The deadline for this event has passed' });
    }

    // Check for duplicate
    const existing = await get(
      `SELECT id FROM interests WHERE show_id = ? AND user_email = ?`,
      [showId, user_email]
    );
    if (existing) {
      return res.status(409).json({ error: 'You have already expressed interest in this show' });
    }

    await run(`
      INSERT INTO interests (show_id, event_id, user_name, user_email, desired_price, max_price, payment_placeholder)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      showId, show.event_id, user_name, user_email,
      desired_price, max_price,
      payment_placeholder ?? 'card ending in 4242',
    ]);

    // Re-run clearing after new interest
    const shows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [show.event_id]);
    const interests = await all(
      `SELECT * FROM interests WHERE event_id = ? AND status NOT IN ('refunded','charged')`,
      [show.event_id]
    );
    const parsedEvent = { ...event, artist_fee_schedule: JSON.parse(event.artist_fee_schedule) };
    const clearingResult = await applyClearing(parsedEvent, shows, interests, false);

    // Return updated state
    const updatedEvent = await get(`SELECT * FROM events WHERE id = ?`, [show.event_id]);
    const updatedShows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [show.event_id]);
    const myInterest = await get(`SELECT * FROM interests WHERE show_id = ? AND user_email = ?`, [showId, user_email]);

    const targetShowResult = clearingResult.show_results.get(showId);

    res.status(201).json({
      interest: myInterest,
      event: { ...updatedEvent, artist_fee_schedule: JSON.parse(updatedEvent.artist_fee_schedule) },
      shows: updatedShows,
      clearing: {
        event_viable: clearingResult.event_viable,
        confirmed_shows_count: clearingResult.confirmed_shows_count,
        your_status: myInterest.status,
        current_price: targetShowResult?.clearing_price
          ? Number(targetShowResult.clearing_price.toFixed(2))
          : null,
        message: buildConfirmationMessage(myInterest.status, targetShowResult, updatedEvent),
      },
    });
  } catch (err) {
    if (err.code === '23505' || err.message?.includes('duplicate key')) {
      return res.status(409).json({ error: 'You have already expressed interest in this show' });
    }
    res.status(500).json({ error: err.message });
  }
});

function buildConfirmationMessage(status, showResult, event) {
  if (status === 'confirmed') {
    const price = showResult?.clearing_price;
    const deadlineDate = new Date(event.deadline).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
    return `¡Estás dentro! Precio actual: $${price?.toFixed(2)}. Este precio puede seguir bajando si más gente se suma antes del ${deadlineDate}.`;
  }
  if (status === 'excluded') {
    return 'Tu precio máximo no alcanza el clearing actual. Si el precio baja o sube tu máximo, podrías entrar.';
  }
  if (status === 'waitlist') {
    return 'Estás en lista de espera. Si alguien cancela o el aforo aumenta, podrías quedar confirmado.';
  }
  return 'Tu interés fue registrado. Estaremos calculando el precio a medida que se sume más gente.';
}

module.exports = router;
