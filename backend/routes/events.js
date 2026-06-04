const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const { runClearing, revenuePerShow, getArtistFee } = require('../clearing');

// Apply clearing result to DB (updates shows + interests + event status)
async function applyClearing(event, shows, allInterests, finalize = false) {
  const result = runClearing(event, shows, allInterests);

  for (const show of shows) {
    const showResult = result.show_results.get(show.id);

    if (!showResult) {
      // This show is not in the confirmed set
      await run(`UPDATE shows SET status = ?, current_clearing_price = NULL WHERE id = ?`,
        [finalize ? 'failed' : show.status, show.id]);
      if (finalize) {
        await run(`UPDATE interests SET status = 'refunded', final_price = NULL WHERE show_id = ? AND status IN ('interested','confirmed')`, [show.id]);
      }
      continue;
    }

    const price = showResult.clearing_price;
    const newShowStatus = finalize ? 'funded' : (result.event_viable ? 'confirmed' : 'open');

    await run(`UPDATE shows SET status = ?, current_clearing_price = ?, final_clearing_price = ? WHERE id = ?`,
      [newShowStatus, price, finalize ? price : show.final_clearing_price, show.id]);

    if (showResult.confirmed_ids.length > 0) {
      const now = new Date().toISOString();
      const confirmedPlaceholders = showResult.confirmed_ids.map(() => '?').join(',');
      await run(
        `UPDATE interests SET status = ?, confirmed_at = COALESCE(confirmed_at, ?), final_price = ?
         WHERE id IN (${confirmedPlaceholders})`,
        [finalize ? 'charged' : 'confirmed', now, finalize ? price : null, ...showResult.confirmed_ids]
      );
    }

    if (showResult.excluded_ids.length > 0) {
      const excPlaceholders = showResult.excluded_ids.map(() => '?').join(',');
      await run(
        `UPDATE interests SET status = 'excluded', final_price = NULL WHERE id IN (${excPlaceholders})`,
        showResult.excluded_ids
      );
    }

    if (showResult.waitlist_ids.length > 0) {
      const wlPlaceholders = showResult.waitlist_ids.map(() => '?').join(',');
      await run(
        `UPDATE interests SET status = 'waitlist' WHERE id IN (${wlPlaceholders})`,
        showResult.waitlist_ids
      );
    }
  }

  // Update event status
  let eventStatus;
  if (finalize) {
    eventStatus = result.event_viable ? 'funded' : 'failed';
  } else {
    eventStatus = result.event_viable ? 'confirmed' : 'open';
  }

  await run(
    `UPDATE events SET status = ?, confirmed_shows_count = ? WHERE id = ?`,
    [eventStatus, result.confirmed_shows_count || null, event.id]
  );

  return result;
}

// GET /api/events — list all events with summary
router.get('/', async (req, res) => {
  try {
    const events = await all(`SELECT * FROM events ORDER BY created_at DESC`);
    const result = [];

    for (const event of events) {
      const shows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [event.id]);
      const totalInterests = await get(
        `SELECT COUNT(*) as cnt FROM interests WHERE event_id = ? AND status NOT IN ('excluded','refunded')`,
        [event.id]
      );

      result.push({
        ...event,
        artist_fee_schedule: JSON.parse(event.artist_fee_schedule),
        shows,
        total_interests: totalInterests.cnt,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:id — full detail
router.get('/:id', async (req, res) => {
  try {
    const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const shows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [event.id]);
    const interests = await all(`SELECT * FROM interests WHERE event_id = ? ORDER BY created_at`, [event.id]);

    const parsedEvent = { ...event, artist_fee_schedule: JSON.parse(event.artist_fee_schedule) };

    // Add price range info
    const nShows = shows.length;
    const feeSchedule = parsedEvent.artist_fee_schedule;
    const maxCapacityTotal = shows.reduce((sum, s) => sum + s.venue_capacity, 0);
    const bufferCapacityTotal = shows.reduce((sum, s) => sum + Math.floor(s.venue_capacity * (1 + s.cancellation_buffer)), 0);

    const priceAtMin = nShows > 0 ? revenuePerShow(parsedEvent, nShows) / shows.reduce((sum, s) => sum + s.min_attendees, 0) * shows.reduce((sum, s) => sum + s.min_attendees, 0) : null;
    const priceAtCapacity = nShows > 0 ? revenuePerShow(parsedEvent, nShows) / (bufferCapacityTotal / nShows) : null;

    // Per-show interest count
    const showsWithStats = shows.map(show => {
      const showInterests = interests.filter(i => i.show_id === show.id && !['excluded', 'refunded'].includes(i.status));
      return { ...show, interest_count: showInterests.length };
    });

    res.json({
      ...parsedEvent,
      shows: showsWithStats,
      interests,
      price_at_min: priceAtMin ? Number(priceAtMin.toFixed(2)) : null,
      price_at_capacity: priceAtCapacity ? Number(priceAtCapacity.toFixed(2)) : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events — create event with shows
router.post('/', async (req, res) => {
  try {
    const {
      title, artist, description, city,
      artist_fee_schedule, cost_per_show, profit_margin,
      deadline, creator_name, creator_email,
      shows: showsInput,
    } = req.body;

    if (!title || !artist || !city || !artist_fee_schedule || !deadline || !creator_name || !creator_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!Array.isArray(showsInput) || showsInput.length === 0) {
      return res.status(400).json({ error: 'At least one show is required' });
    }

    const { lastID: eventId } = await run(`
      INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title, artist, description ?? '', city,
      typeof artist_fee_schedule === 'string' ? artist_fee_schedule : JSON.stringify(artist_fee_schedule),
      cost_per_show ?? 0, profit_margin ?? 0.15,
      deadline, creator_name, creator_email,
    ]);

    for (let i = 0; i < showsInput.length; i++) {
      const s = showsInput[i];
      await run(`
        INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, cancellation_buffer, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [eventId, s.date, s.venue_name, s.venue_capacity, s.min_attendees, s.cancellation_buffer ?? 0.10, i]);
    }

    const event = await get(`SELECT * FROM events WHERE id = ?`, [eventId]);
    const shows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [eventId]);

    res.status(201).json({ ...event, artist_fee_schedule: JSON.parse(event.artist_fee_schedule), shows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/:id/check — run clearing (pass ?finalize=true to lock prices)
router.post('/:id/check', async (req, res) => {
  try {
    const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (['funded', 'failed'].includes(event.status)) {
      return res.status(400).json({ error: `Event already ${event.status}` });
    }

    const shows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [event.id]);
    const interests = await all(
      `SELECT * FROM interests WHERE event_id = ? AND status NOT IN ('refunded','charged')`,
      [event.id]
    );

    const parsedEvent = { ...event, artist_fee_schedule: JSON.parse(event.artist_fee_schedule) };
    const finalize = req.query.finalize === 'true';
    const result = await applyClearing(parsedEvent, shows, interests, finalize);

    const updatedEvent = await get(`SELECT * FROM events WHERE id = ?`, [event.id]);
    const updatedShows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [event.id]);

    res.json({
      event: { ...updatedEvent, artist_fee_schedule: JSON.parse(updatedEvent.artist_fee_schedule) },
      shows: updatedShows,
      clearing_result: {
        event_viable: result.event_viable,
        confirmed_shows_count: result.confirmed_shows_count,
        revenue_per_show: result.revenue_per_show ? Number(result.revenue_per_show.toFixed(2)) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:id/simulate — estimate price if someone with given params joins
router.get('/:id/simulate', async (req, res) => {
  try {
    const { show_id, max_price, desired_price } = req.query;
    if (!show_id || !max_price) {
      return res.status(400).json({ error: 'show_id and max_price are required' });
    }

    const event = await get(`SELECT * FROM events WHERE id = ?`, [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const shows = await all(`SELECT * FROM shows WHERE event_id = ? ORDER BY sort_order`, [event.id]);
    const interests = await all(
      `SELECT * FROM interests WHERE event_id = ? AND status NOT IN ('refunded','charged','excluded')`,
      [event.id]
    );

    const parsedEvent = { ...event, artist_fee_schedule: JSON.parse(event.artist_fee_schedule) };

    // Current state (without hypothetical)
    const current = runClearing(parsedEvent, shows, interests);

    // Hypothetical state
    const { simulateInterest } = require('../clearing');
    const simResult = simulateInterest(
      parsedEvent, shows, interests,
      Number(show_id), Number(max_price), Number(desired_price ?? max_price)
    );

    const targetShow = shows.find(s => s.id === Number(show_id));
    const currentResult = current.show_results.get(Number(show_id));
    const simShowResult = simResult.show_results.get(Number(show_id));

    res.json({
      current_clearing_price: currentResult?.clearing_price ? Number(currentResult.clearing_price.toFixed(2)) : null,
      simulated_clearing_price: simShowResult?.clearing_price ? Number(simShowResult.clearing_price.toFixed(2)) : null,
      current_confirmed_shows: current.confirmed_shows_count,
      simulated_confirmed_shows: simResult.confirmed_shows_count,
      qualifies: simShowResult?.confirmed_ids.includes('__hypothetical__') ?? false,
      message: buildSimMessage(current, simResult, targetShow, Number(max_price)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildSimMessage(current, sim, show, maxPrice) {
  if (!sim.event_viable) {
    return 'Aunque te sumés, el evento todavía no alcanza el mínimo necesario.';
  }
  const simShowResult = sim.show_results.get(show?.id);
  if (!simShowResult) return 'Este show no sería confirmado.';
  const price = simShowResult.clearing_price;
  if (maxPrice < price) {
    return `Tu precio máximo ($${maxPrice}) no alcanza el clearing actual ($${price?.toFixed(2)}). No clasificarías por ahora.`;
  }
  const current_price = current.show_results.get(show?.id)?.clearing_price;
  if (current_price && price < current_price) {
    return `Si te sumás, el precio bajaría de $${current_price.toFixed(2)} a $${price.toFixed(2)} por show.`;
  }
  return `Si te sumás, el precio estimado sería $${price?.toFixed(2)} por show.`;
}

module.exports = router;
module.exports.applyClearing = applyClearing;
