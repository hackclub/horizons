# Archive

Code that has been retired from the active build but kept for reference. Nothing here is imported by `src/` and nothing here is compiled (tsconfig only includes `src/**/*`).

## `mail/`

The previous email infrastructure: `MailService`, `MailController`, `MailModule`, MJML templates, and S/MIME signing utilities. It was already disabled at the time of archival — `sendImmediateEmail` only wrote `EmailJob` rows marked `sent` without actually transmitting anything, and the SMTP/nodemailer code was commented out.

Archived rather than deleted so the templates, S/MIME util, and email-job/scheduler patterns are available as reference when the replacement emailing module is built. See the `// TODO(emailing)` markers in `submission-approval.service.ts` for the intended replacement point.

## `templates/`

MJML email templates that paired with the archived mail service.

## `manifest/`

`ManifestBackfillService` — gated by `RUN_MANIFEST_BACKFILL=true`, swept every project with a `repoUrl` and called `manifest.createDraft()` at 200ms intervals. One-shot; the backfill has run. Removed from `ManifestModule` providers.

## `airtable/`

`AirtableBackfillService` — gated by `RUN_AIRTABLE_USERS_BACKFILL=true`, loaded every user with all nested projects + first submissions, then synced `signUp`/`firstProjectCreated`/`firstSubmit` events to Airtable at 700ms per user. Also migrated `referralCode` to `userId.toString()` for any user whose code didn't match. One-shot; removed from `AirtableModule` providers.

## `slack-channels/`

Just the backfill chunks excised from `SlackChannelsService` — `onModuleInit`, `run()`, the DM block builder, and the `sendDm` branch of `processUser`. The service itself stays in `src/` because `inviteSingleUser`, `inviteToSubeventChannel`, and `removeUserFromAllChannels` are used by normal flows.
