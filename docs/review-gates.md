# Review gates — two independent gates, one reconciled outcome

Project approval has two independent gates that run in parallel:

1. **Reviewer gate** (`Submission.reviewPassed`) — a human reviewer's decision, set by the reviewer dashboard.
2. **Fraud gate** (`Project.joeFraudPassed`) — the external fraud-review platform ("Joe") decision, set by the fraud polling service.

A submission's final outcome (`Submission.approvalStatus`) stays `pending` until both gates have resolved. The reconciliation is owned by `SubmissionApprovalService.evaluateAndFinalize()`.

## Truth table

| `reviewPassed` | `joeFraudPassed` | `approvalStatus` | Side effects |
|----------------|------------------|------------------|--------------|
| null | any | pending | none |
| any | null (fraud enabled) | pending | none |
| true | true (or fraud disabled) | approved | Airtable sync, project data copy, Slack, conditional email |
| true | false | rejected (**silent reject**) | none |
| false | any | rejected | rejection Slack + conditional email |

The helper CAS's on `approvalStatus='pending'` inside a transaction, so concurrent reviewer + fraud-poll triggers produce exactly one transition.

**Fraud-disabled fallback:** when `FraudReviewService.isEnabled()===false` (no `JOE_*` env vars), the helper treats `joeFraudPassed===null` as `true`. Reviewer approvals finalize immediately.

**Silent reject** is identified downstream by `approvalStatus='rejected' AND reviewPassed=true` — no dedicated column.

## On submission / resubmission

Resubmit eligibility (checked in `projects.service.ts` `createSubmission`):

| Most recent prior submission | Can resubmit? |
|------------------------------|---------------|
| none (first submission) | yes |
| `approvalStatus='approved'` | yes |
| `approvalStatus='rejected'` AND `reviewPassed=false` (reviewer-rejected) | yes |
| `approvalStatus='rejected'` AND `reviewPassed IS NULL` (fraud-auto-rejected) | yes |
| `approvalStatus='pending'` | **no** — `BadRequestException('You have a pending submission.')` |
| `approvalStatus='rejected'` AND `reviewPassed=true` (silent reject) | **no** (user sees it as pending) |

When a resubmit is allowed:

| Most recent prior | joe\* fields | Submit to Joe? |
|-------------------|--------------|----------------|
| none | n/a | yes |
| `approved` | cleared | yes (new hours to re-check) |
| `rejected` with `reviewPassed` not `true` | **untouched** | **no** — prior fraud outcome is reused |

## User-visible status mapping

Silent rejects (`approvalStatus='rejected' AND reviewPassed=true`) are remapped to `approvalStatus='pending'` for end users via `ProjectsService.scopeSubmissionForUser()` and the `/me` endpoint in `auth.service.ts`. Users never see that their submission was fraud-failed after reviewer approval — the fraud team handles those off-service.

## Reviewer UI

`admin/src/routes/(app)/review/[projectId]/+page.svelte` exposes the fraud status (pending / passed / failed) + `joeTrustScore` to reviewers. `VerdictPanel` shows a yellow warning when approving with fraud pending (finalization will be deferred) and a red warning when approving with fraud failed (will silent-reject).

## Admin metrics

Counts produced by `computeReviewProjects` in `admin.service.ts`:
- `reviewQueue` — pending submissions the reviewer hasn't decided yet (`approvalStatus='pending' AND reviewPassed IS NULL`).
- `awaitingFraud` — reviewer decided, state machine waiting on fraud (`approvalStatus='pending' AND reviewPassed IS NOT NULL`).
- `fraudTeamDeliberation` — silent rejects (`approvalStatus='rejected' AND reviewPassed=true`).
- `fraudQueue`, `fraudChecked` — unchanged (project-level counts).

## Legacy `Project.isFraud`

Removed. Fraud state is driven exclusively by Joe (`joeFraudPassed`). `User.isFraud` and `User.isSus` (user-level manual admin flags) are unchanged.
