# v0.16.14 common UI standards, applied to isolated sandbox only

- Initial loading, manual refresh and mutations: a separate native modal busy dialog opens with spinner and status text. Background main and member management dialog become inert until the request completes.
- Background automatic refresh: no screen locking. Currently there is no background polling in these two sandbox screens. If added later, do not render while user is interacting or a request is locked; defer rendering until safe.
- Pre-mutation confirmation: operation-management style in-app dialog. Cancel does not call the API.
- Success: after a successful response and readback (on mutations), show bottom toast.
- Error: an in-app error dialog stays visible until user presses Close. Escape is disabled while an error dialog is open.
- Network errors and timeouts: no automatic retry of any mutation. Attempt read-only refresh to reconcile status; show an explicit unknown-outcome message.
- HTTP 409: no blind retry; read latest state.
- Duplicate taps: a single UI busy lock plus modal dialogs; individual action buttons and select fields are non-interactive while busy.
- Role changes are allowed only for active non-self test members and remain server-authorized. Withdrawal and rich-menu-sync remain unavailable.
- Cache-busting v=1614 on the changed JS/CSS files.
- URLs: register https://liff.line.me/2012602642-zr2JOGHa?v=1614 ; manage https://liff.line.me/2012602642-jUN8W2eA?v=1614

All edits under withdraw-sandbox only. No GAS, Worker, shared official menu or original match/live files changed.
## Canceling a role-change confirmation (clarified in v0.16.15)

Selecting a different role in the dropdown is a local, unsaved choice. Pressing Change opens a confirmation dialog. Cancel:
- does NOT send a role-change API request;
- keeps the chosen dropdown value in place;
- keeps Change available when the selected value differs from the server's current role;
- does not alter the server's stored role.
Confirm sends exactly one mutation and reloads the authoritative server state before showing success. Manual Refresh or reopening the management dialog reloads server values and discards the unsaved local selection. A failed mutation is not treated as successful.
