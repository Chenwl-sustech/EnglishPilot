# Web password recovery

The owner forgot the manually created learning password. Preserve the existing user and learning data, provide a usable reset entry, and let the owner enter and submit the new password privately. The user already opted out of routine design questions; the implementation choice below is the implementer's.

Use the official Supabase PKCE email flow on a separate `/reset-password/` page. A dedicated recovery client persists only expiring PKCE verifiers in its own storage namespace; recovery access/refresh sessions stay in memory and never activate the learning account. Clear callback query/hash before exchange. Require a successful recovery-type exchange before accepting a new password; verify confirmation and an eight-character minimum, expire the in-page grant after ten minutes, and clear its session after success. Use only the public project key. No administrator keys, password logging, account deletion, signup changes or database password edits.

Alternatives: the existing OTP flow needs an editable email template/SMTP and remains supported for deployments that configured it; administrator password edits would require privileged credentials and are unnecessary. The new link mode is explicitly enabled only for the web preview. Default mail is suitable only for project organization members and remains rate limited; this owner's learning email matches that membership. Other users need custom SMTP.

Keep the existing OTP build flag value `1`; add `link` for a link to the standalone web page, default `0`. Native login/session behavior remains unchanged. Configure only the exact owned HTTPS callback URL. A recovery link must open in the browser where it was requested; expired links, a different browser and non-recovery codes must fail safely and offer another request. User submits all new credential entry. No recovery URL/session is sent into chat or GitHub.

Verify SDK requests/storage against synthetic HTTP responses, validation/expiry/cleanup, a static build and deployed callback page before requesting a real email. The owner's actual password submission is a handoff; never read filled password fields or session storage.
