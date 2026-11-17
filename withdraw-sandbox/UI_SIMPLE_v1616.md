# v0.16.16: Simpler interface for first-time, elderly users

- Keep on-screen instructions short, avoid backend/Worker/technical words.
- Registration: display name input and submit button only when not_requested or rejected; otherwise show status and refresh.
- Manager: show pending approvals and member roles immediately after authenticated loading; no extra Open button. Withdrawal history under a simple collapsible section.
- Larger buttons and input controls, consistent blue/gray theme.
- Preserve modal confirmations, busy lock, error dialogs, and success toast.
- Preserve pending dropdown role on confirm Cancel.
- No new LINE account: actual unregistered-LINE end-to-end remains untested; use mocked UI and existing synthetic GAS checks instead.
- Do not change original match/live pages, LINE rich menus or Workers.
