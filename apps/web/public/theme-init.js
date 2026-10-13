// Applies the saved (or OS) theme before the first paint, so dark-mode users never see a flash of
// the light theme. A separate file rather than an inline <script>, so the Content-Security-Policy can
// allow scripts from our own origin only. Keep the key in sync with src/ui/theme.tsx.
(function () {
  var theme = "dark";
  try {
    var saved = localStorage.getItem("voicedesk.theme");
    theme = saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch (e) {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
