# v0.16.29 isolated withdrawal E2E frontend
This is a separate static UI folder. It is not connected to current staging or the prior withdrawal sandbox.

- The Worker URL and two LIFF IDs are placeholders. No real connection can be made until new isolated Worker, GAS, and LIFF are configured.
- `api.js` has `withdrawUiEnabled:false` and blocks the withdrawal endpoint. This is a UI safety gate, NOT server authorization.
- A future, explicitly approved E2E test may enable it in this subfolder only, after the two server feature flags, exact isolated spreadsheet ID and exact fixture member ID have been verified.
- Only `M-TEST-WITHDRAW-1629` (`退会E2E対象（架空1629）`) can ever be shown as a withdrawal target. Both member/duty roles are allowed; admins and other members never show the button.
- GAS `SPREADSHEET_ID`: `1H491pOU_HrI5TDxFtjPZli9YMf8Zwld6U6n8BX1frjw`. Never use the main staging or previous sandbox sheet.
- New LIFF endpoints (create separately): `https://hitoriojisan52.github.io/zenryoku-smash-staging/withdraw-v1629/manage.html` and `https://hitoriojisan52.github.io/zenryoku-smash-staging/withdraw-v1629/register.html`.
- Do not copy the existing v0.16.18 LIFF IDs, Worker URL, GAS script properties or secrets.
- No Cloudflare/GAS configuration was changed when these files were created.
