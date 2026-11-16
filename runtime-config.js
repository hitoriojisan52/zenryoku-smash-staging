/* GitHub Pages public settings. LINE LIFF IDs and Worker URLs are public; NEVER put backend secrets here. */
window.SMASH_CONFIG = {
  // LIFF for duty/admin match operation screen (endpoint: match.html)
  liffId: "2012602642-3FKiOTVx",
  // LIFF for member view screen (endpoint: match-view.html)
  viewLiffId: "REPLACE_WITH_VIEW_LIFF_ID",
  // LIFF for duty collection screen (endpoint: live.html, later stage)
  liveLiffId: "REPLACE_WITH_LIVE_LIFF_ID",
  apiBaseUrl: "https://zenryoku-smash-staging-api.hitori-ojisan-52.workers.dev",
  // Enable only AFTER the new GAS and Worker versions are deployed.
  useMatchBootstrap: true,
  // v0.16 feature gate: keep OFF until GAS add-on and Worker are deployed.
  accessFeaturesEnabled: false
};
