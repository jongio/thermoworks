// SPA redirect recovery for GitHub Pages. public/404.html stashes the intended
// URL in sessionStorage and bounces to the app root; this restores it before the
// router reads the location. Living in a module (rather than an inline <script>)
// lets the production build ship a Content-Security-Policy with no inline
// scripts. It runs on import, before createRoot in main.tsx.
const redirect = sessionStorage.getItem("redirect");
sessionStorage.removeItem("redirect");
if (redirect && redirect !== location.href) {
	history.replaceState(null, "", redirect);
}

export {};
