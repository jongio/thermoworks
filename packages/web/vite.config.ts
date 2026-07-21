import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const REFERER = "https://cloud.thermoworks.com/";

// Content-Security-Policy for the deployed build. Injected at build time only,
// so it never interferes with the Vite dev server's HMR websocket. The app has
// no inline scripts (the SPA redirect lives in src/spa-redirect.ts), so script
// execution is limited to same-origin bundles. connect-src is pinned to the
// ThermoWorks Cloud / Firebase hosts the client actually calls.
const CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https:",
	"font-src 'self' data:",
	"connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebase.googleapis.com https://firestore.googleapis.com https://us-central1-thermoworks-cloud-production.cloudfunctions.net",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
].join("; ");

function injectCspMeta(): Plugin {
	return {
		name: "inject-csp-meta",
		apply: "build",
		transformIndexHtml() {
			return [
				{
					tag: "meta",
					attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
					injectTo: "head-prepend",
				},
			];
		},
	};
}

export default defineConfig({
	base: "./",
	plugins: [react(), tailwindcss(), injectCspMeta()],
	build: {
		target: "es2022",
	},
	server: {
		proxy: {
			"/api/identity": {
				target: "https://identitytoolkit.googleapis.com",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/identity/, ""),
				headers: { referer: REFERER },
			},
			"/api/token": {
				target: "https://securetoken.googleapis.com",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/token/, ""),
				headers: { referer: REFERER },
			},
			"/api/firebase": {
				target: "https://firebase.googleapis.com",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/firebase/, ""),
				headers: { referer: REFERER },
			},
			"/api/firestore": {
				target: "https://firestore.googleapis.com",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/firestore/, ""),
				headers: { referer: REFERER },
			},
			"/api/functions": {
				target: "https://us-central1-thermoworks-cloud-production.cloudfunctions.net",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/functions/, ""),
				headers: { referer: REFERER },
			},
		},
	},
});
