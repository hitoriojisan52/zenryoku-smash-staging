/* GitHub Pages public settings. LINE LIFF IDs and Worker URLs are public; NEVER put backend secrets here. */
window.SMASH_CONFIG = {
  // LIFF for duty/admin match operation screen (endpoint: match.html)
  liffId: "2012602642-3FKiOTVx",
  // LIFF for member view screen (endpoint: match-view.html)
  viewLiffId: "REPLACE_WITH_VIEW_LIFF_ID",
  // LIFF for operation management screen (endpoint: live.html)
  liveLiffId: "2012602642-XBSkXduO",
  apiBaseUrl: "https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev",
  // Public page for QR links; GAS SMA16.site MUST match this exactly on deployment.
  // Change only when production host + GAS + LIFF endpoint + CORS are ready.
  guestViewUrl: "https://hitoriojisan52.github.io/zenryoku-smash-staging/guest.html",
  // Enable only AFTER the new GAS and Worker versions are deployed.
  useMatchBootstrap: true,
  // v0.16 feature gate: keep OFF until GAS add-on and Worker are deployed.
  accessFeaturesEnabled: true
};
