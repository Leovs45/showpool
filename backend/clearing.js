/**
 * Clearing algorithm — pure functions, no DB/Express dependencies.
 *
 * Terminology:
 *   - event: has artist_fee_schedule (JSON) + cost_per_show + profit_margin
 *   - shows: array of show objects with venue_capacity, min_attendees, cancellation_buffer
 *   - interests: array of {show_id, max_price, desired_price} objects
 *
 * The algorithm tries to confirm as many shows as possible (greedy, high→low).
 * For N confirmed shows:
 *   total_cost(N) = artist_fee(N) + cost_per_show * N
 *   revenue_needed(N) = total_cost(N) * (1 + profit_margin)
 *   revenue_per_show(N) = revenue_needed(N) / N
 *
 * Each show independently finds its clearing price given revenue_per_show(N).
 * A show is viable if enough people have max_price >= clearing_price.
 */

/**
 * Get artist fee for N shows from the schedule.
 * Extrapolates linearly if N is not explicitly in the schedule.
 */
function getArtistFee(artistFeeSchedule, n) {
  const schedule = typeof artistFeeSchedule === 'string'
    ? JSON.parse(artistFeeSchedule)
    : artistFeeSchedule;

  if (schedule[String(n)] !== undefined) return schedule[String(n)];

  const keys = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return 0;
  if (n <= keys[0]) return schedule[String(keys[0])];

  // Extrapolate: use last two points to get marginal cost per additional show
  const last = keys[keys.length - 1];
  const secondLast = keys[keys.length - 2] ?? last;
  const lastFee = schedule[String(last)];
  const secondLastFee = schedule[String(secondLast)] ?? lastFee;
  const marginalCost = secondLast === last ? lastFee : (lastFee - secondLastFee) / (last - secondLast);
  return lastFee + marginalCost * (n - last);
}

/**
 * Calculate required revenue per show for N confirmed shows.
 */
function revenuePerShow(event, n) {
  const artistFee = getArtistFee(event.artist_fee_schedule, n);
  const totalCost = artistFee + event.cost_per_show * n;
  const totalRevenue = totalCost * (1 + event.profit_margin);
  return totalRevenue / n;
}

/**
 * Run clearing for a single show given a revenue target.
 * Returns { viable, clearing_price, confirmed_count, confirmed_ids, excluded_ids }.
 *
 * @param {object} show - { id, venue_capacity, min_attendees, cancellation_buffer }
 * @param {Array}  interests - [{ id, max_price, desired_price }] for this show
 * @param {number} targetRevenue - revenue_per_show(N) that this show must generate
 */
function clearShow(show, interests, targetRevenue) {
  const buffer = show.cancellation_buffer ?? 0.1;
  const maxSlots = Math.floor(show.venue_capacity * (1 + buffer));
  const minAttendees = show.min_attendees;

  // Sort by max_price desc; tie-break by desired_price desc
  const sorted = [...interests].sort((a, b) => {
    if (b.max_price !== a.max_price) return b.max_price - a.max_price;
    return (b.desired_price ?? 0) - (a.desired_price ?? 0);
  });

  let bestResult = null;

  // Try increasing group sizes from min_attendees to maxSlots
  for (let m = minAttendees; m <= Math.min(sorted.length, maxSlots); m++) {
    const clearingPrice = targetRevenue / m;
    const qualified = sorted.filter(i => i.max_price >= clearingPrice);

    if (qualified.length >= m) {
      // This M is viable — keep going to find the largest M (lowest price)
      const confirmed = qualified.slice(0, m);
      const confirmedIds = new Set(confirmed.map(i => i.id));
      bestResult = {
        viable: true,
        clearing_price: clearingPrice,
        confirmed_count: m,
        confirmed_ids: confirmed.map(i => i.id),
        excluded_ids: sorted.filter(i => !confirmedIds.has(i.id)).map(i => i.id),
        waitlist_ids: qualified.slice(m).map(i => i.id),
      };
    }
  }

  if (!bestResult) {
    return {
      viable: false,
      clearing_price: null,
      confirmed_count: 0,
      confirmed_ids: [],
      excluded_ids: sorted.map(i => i.id),
      waitlist_ids: [],
    };
  }

  return bestResult;
}

/**
 * Main entry point. Run clearing across all shows of an event.
 *
 * @param {object} event  - event row from DB (has artist_fee_schedule, cost_per_show, profit_margin)
 * @param {Array}  shows  - array of show rows for this event
 * @param {Array}  allInterests - all interest rows for this event (with show_id)
 * @returns {object} {
 *   confirmed_shows_count,       // how many shows get confirmed
 *   show_results: Map<showId, clearResult>,
 *   revenue_per_show,
 *   total_revenue_needed,
 *   event_status,               // 'confirmed' | 'open' | 'funded'
 * }
 */
function runClearing(event, shows, allInterests) {
  // Try from max shows down to 1
  for (let n = shows.length; n >= 1; n--) {
    const target = revenuePerShow(event, n);
    const showResults = new Map();
    let allViable = true;

    // Check the n shows with the most interest first (sort by interest count desc)
    const interestCountByShow = {};
    for (const interest of allInterests) {
      interestCountByShow[interest.show_id] = (interestCountByShow[interest.show_id] ?? 0) + 1;
    }
    const showsSorted = [...shows].sort(
      (a, b) => (interestCountByShow[b.id] ?? 0) - (interestCountByShow[a.id] ?? 0)
    );
    const candidateShows = showsSorted.slice(0, n);

    for (const show of candidateShows) {
      const showInterests = allInterests.filter(i => i.show_id === show.id);
      const result = clearShow(show, showInterests, target);
      showResults.set(show.id, result);
      if (!result.viable) {
        allViable = false;
        break;
      }
    }

    if (allViable) {
      const artistFee = getArtistFee(event.artist_fee_schedule, n);
      const totalCost = artistFee + event.cost_per_show * n;
      const totalRevenue = totalCost * (1 + event.profit_margin);
      return {
        confirmed_shows_count: n,
        show_results: showResults,
        revenue_per_show: target,
        total_revenue_needed: totalRevenue,
        event_viable: true,
      };
    }
  }

  return {
    confirmed_shows_count: 0,
    show_results: new Map(),
    revenue_per_show: null,
    total_revenue_needed: null,
    event_viable: false,
  };
}

/**
 * Simulate: what would happen if a new interest with given params joined a show?
 * Returns estimated clearing_price without modifying anything.
 */
function simulateInterest(event, shows, allInterests, showId, maxPrice, desiredPrice) {
  const hypothetical = {
    id: '__hypothetical__',
    show_id: showId,
    max_price: maxPrice,
    desired_price: desiredPrice,
  };
  const augmented = [...allInterests, hypothetical];
  return runClearing(event, shows, augmented);
}

module.exports = { runClearing, simulateInterest, revenuePerShow, getArtistFee, clearShow };
