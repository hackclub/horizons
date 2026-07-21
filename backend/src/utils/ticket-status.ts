import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

export interface UserTicketStatus {
  /** User holds an EventTicket transaction for their pinned event. */
  boughtTicket: boolean;
  /**
   * User hasn't bought yet, but their projected balance — approved hours
   * (counting the hackatime_hours of any still-pending latest submission)
   * minus non-refunded spend — would clear the pinned event's ticket
   * threshold, i.e. they'd qualify once their pending reviews approve.
   */
  canBuyTicketIfApproved: boolean;
}

/**
 * Compute per-user event-ticket status for the given users, keyed by userId.
 *
 * "Can buy if approved" mirrors the metrics `approved_plus_pending_total`
 * projection (see AdminService.getStats): for each of the user's non-deleted
 * projects we count the still-pending latest submission's hackatime_hours
 * snapshot in place of approved hours, sum across projects, then subtract the
 * user's non-refunded transaction spend — the real ticket gate is on balance
 * (see EventsService.buyTicket), so spending and admin adjustments count.
 * Gate on the pinned event's ticketThreshold (`rsvp_cost`; null = no gate,
 * always qualifies). Users with no pinned event get `{ false, false }` —
 * there's no event context to gate against.
 *
 * Lives in utils (not a service) so both AdminService and ReviewerService can
 * call it with their injected PrismaService without cross-module wiring.
 */
export async function computeUserTicketStatuses(
  prisma: PrismaService,
  userIds: number[],
): Promise<Map<number, UserTicketStatus>> {
  const result = new Map<number, UserTicketStatus>();
  if (userIds.length === 0) return result;

  const rows = await prisma.$queryRaw<
    Array<{
      user_id: number;
      threshold: number | null;
      has_event: boolean;
      bought: boolean;
      projected_balance: number | string | null;
    }>
  >(Prisma.sql`
    SELECT
      u.user_id AS user_id,
      e.rsvp_cost AS threshold,
      (pe.user_id IS NOT NULL) AS has_event,
      (et.user_id IS NOT NULL) AS bought,
      COALESCE(ut.approved_plus_pending, 0) - COALESCE(sp.spent, 0) AS projected_balance
    FROM users u
    LEFT JOIN pinned_events pe ON pe.user_id = u.user_id
    LEFT JOIN events e ON e.event_id = pe.event_id
    LEFT JOIN (
      SELECT DISTINCT user_id, event_id
      FROM transactions
      WHERE kind = 'EventTicket' AND event_id IS NOT NULL
    ) et ON et.user_id = u.user_id AND et.event_id = pe.event_id
    LEFT JOIN (
      SELECT
        p.user_id,
        SUM(
          CASE
            -- Latest submission still pending: count its hackatime_hours
            -- snapshot (what the reviewer can actually approve), keeping any
            -- earlier locked-in approved hours via GREATEST.
            WHEN (
              SELECT s.hackatime_hours FROM submissions s
              WHERE s.project_id = p.project_id
                AND s.approval_status = 'pending'
                AND s.review_passed IS NULL
                AND s.created_at = (
                  SELECT MAX(s2.created_at) FROM submissions s2
                  WHERE s2.project_id = p.project_id
                )
            ) IS NOT NULL
            THEN GREATEST(
              COALESCE(p.approved_hours, 0),
              COALESCE((
                SELECT s.hackatime_hours FROM submissions s
                WHERE s.project_id = p.project_id
                  AND s.approval_status = 'pending'
                  AND s.review_passed IS NULL
                  AND s.created_at = (
                    SELECT MAX(s2.created_at) FROM submissions s2
                    WHERE s2.project_id = p.project_id
                  )
              ), 0)
            )
            ELSE COALESCE(p.approved_hours, 0)
          END
        ) AS approved_plus_pending
      FROM projects p
      WHERE p.deleted_at IS NULL
      GROUP BY p.user_id
    ) ut ON ut.user_id = u.user_id
    LEFT JOIN (
      SELECT user_id, SUM(cost) AS spent
      FROM transactions
      WHERE refunded_at IS NULL
      GROUP BY user_id
    ) sp ON sp.user_id = u.user_id
    WHERE u.user_id IN (${Prisma.join(userIds)})
  `);

  for (const r of rows) {
    const bought = Boolean(r.bought);
    const hasEvent = Boolean(r.has_event);
    const threshold = r.threshold == null ? null : Number(r.threshold);
    const projectedBalance = Number(r.projected_balance ?? 0);
    const qualifies =
      hasEvent && (threshold == null || projectedBalance >= threshold);
    result.set(Number(r.user_id), {
      boughtTicket: bought,
      canBuyTicketIfApproved: !bought && qualifies,
    });
  }
  // Any requested user the query didn't return (shouldn't happen) defaults off.
  for (const id of userIds) {
    if (!result.has(id)) {
      result.set(id, { boughtTicket: false, canBuyTicketIfApproved: false });
    }
  }
  return result;
}
