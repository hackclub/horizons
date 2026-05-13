# Sub-event stats integration

`GET /api/integrations/event-stats?name=<slug-or-title>` — public-via-API-key endpoint that returns aggregated stats for a single sub-event, designed for external dashboards / "how are we doing" graphs.

- **Auth:** `x-api-key` header, compared in constant-time against `INTEGRATIONS_API_KEY`.
- **Identifier:** `name` may be the event `slug` (preferred) or a case-insensitive `title` match.
- **Source of truth:** the same `pinned_events`, `projects.approved_hours`, and `historical_metrics` rows the admin dashboard reads — so external charts reconcile with the internal numbers.

## Why it matters

Sub-events (city meetups, regional cohorts) need their own success metrics that organizers can plot in their own tools without admin access to Horizons. This endpoint exposes the four numbers organizers actually care about:

1. **Reach** — how many people signed up for *their* event.
2. **Engagement** — how many of those people are actually shipping hours.
3. **Qualification** — how many will hit the RSVP / qualifying thresholds.
4. **Trajectory** — are sign-ups and daily activity trending up or stalled?

It's read-only and rate-limit-friendly: every shape is pre-aggregated, no per-request Hackatime calls.

## Response shape

| Field | Type | Meaning |
|---|---|---|
| `event` | object | Sub-event metadata (slug, title, dates, hour cost, ticket settings, isActive). |
| `pinnedCount` | number | Total users currently pinned to this sub-event. |
| `metHourGoal` | number | Pinned users whose summed `approvedHours` ≥ `event.hourCost`. |
| `notMetHourGoal` | number | Pinned users whose summed `approvedHours` < `event.hourCost`. |
| `dauYesterday` | number | DAU for this sub-event for the previous UTC day (today is intentionally omitted — it's mid-stream). |
| `pinnedTimeline` | `TimeSeriesPoint[]` | Cumulative pinned-user count, one point per day for the last 30 days. Ends at the live `pinnedCount`. |
| `dauTimeline` | `TimeSeriesPoint[]` | Daily active users for this sub-event, last 30 days, sourced from `historical_metrics` (`dau_event.<slug>`). |
| `qualification` | object | Funnel counts among pinned users: `signedUp`, `engaged` (≥1h), `rsvped` (≥15h), `qualified` (≥30h). |
| `generatedAt` | ISO string | Server time the response was assembled. |

`TimeSeriesPoint = { date: "YYYY-MM-DD", value: number }`.

### Example payload (abridged)

```json
{
  "event": { "slug": "test-event", "title": "Test Event", "hourCost": 30, "isActive": true, ... },
  "pinnedCount": 5,
  "metHourGoal": 1,
  "notMetHourGoal": 4,
  "dauYesterday": 2,
  "pinnedTimeline": [
    { "date": "2026-04-14", "value": 0 },
    { "date": "2026-04-19", "value": 1 },
    { "date": "2026-04-25", "value": 2 },
    { "date": "2026-05-13", "value": 5 }
  ],
  "dauTimeline": [
    { "date": "2026-04-14", "value": 0 },
    { "date": "2026-04-19", "value": 1 },
    { "date": "2026-05-13", "value": 3 }
  ],
  "qualification": { "signedUp": 5, "engaged": 3, "rsvped": 2, "qualified": 1 },
  "generatedAt": "2026-05-13T22:57:44.995Z"
}
```

## Charts you can build from this payload

### Headline tiles
- **Pinned** — `pinnedCount`. The "RSVP'd to this event" number.
- **DAU yesterday** — `dauYesterday`. Use the colour scale against `pinnedCount` to surface drop-off.
- **Hour-goal split** — donut of `metHourGoal` vs `notMetHourGoal`. Single glance: are people clearing the bar?

### Time series
- **Cumulative sign-ups (line / area)** — plot `pinnedTimeline.value` over `date`. Slope = acquisition velocity; flat tail = stalled growth.
- **Daily active users (bar or line)** — plot `dauTimeline`. Overlay onto the cumulative line to see "are new sign-ups actually showing up?".
- **Engagement ratio (derived line)** — for each day, `dauTimeline[i].value / pinnedTimeline[i].value`. Stays at 1.0 in healthy events; drops as you onboard people who never come back.

### Funnel
- **Qualification funnel (horizontal funnel / bar chart)** — bars for `signedUp → engaged → rsvped → qualified`. The drop between each pair is the actionable signal:
  - `signedUp → engaged` big drop = onboarding problem (Hackatime link, project create).
  - `engaged → rsvped` big drop = momentum problem (people start but stall before 15h).
  - `rsvped → qualified` big drop = finish-line problem (people give up between RSVP and 30h).

### Comparison
- **Hour-goal stacked bar per sub-event** — call the endpoint per slug and stack `metHourGoal` / `notMetHourGoal` to rank events by completion rate.
- **DAU sparkline grid** — one mini `dauTimeline` per sub-event in a small-multiples grid, sorted by `pinnedCount`. Great for org-level rollups.

## Notes for chart authors

- The two timelines share an x-axis (last 30 UTC days) so they overlay cleanly without resampling.
- `dauTimeline` reads from yesterday's snapshot backwards — today won't appear until the midnight cron writes it.
- `pinnedTimeline` is *cumulative*, not daily — diff consecutive points if you want a "new sign-ups per day" bar chart.
- All counts are live except `dauTimeline` and `dauYesterday`, which lag by one day.
