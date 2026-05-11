# Archive

Code that has been retired from the active build but kept for reference. Nothing here is imported by `src/` and nothing here is compiled (tsconfig only includes `src/**/*`).

## `mail/`

The previous email infrastructure: `MailService`, `MailController`, `MailModule`, MJML templates, and S/MIME signing utilities. It was already disabled at the time of archival — `sendImmediateEmail` only wrote `EmailJob` rows marked `sent` without actually transmitting anything, and the SMTP/nodemailer code was commented out.

Archived rather than deleted so the templates, S/MIME util, and email-job/scheduler patterns are available as reference when the replacement emailing module is built. See the `// TODO(emailing)` markers in `submission-approval.service.ts` for the intended replacement point.

## `templates/`

MJML email templates that paired with the archived mail service.
