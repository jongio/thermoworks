import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const REFERER = "https://cloud.thermoworks.com/";

export default defineConfig({
	base: "./",
	plugins: [react(), tailwindcss()],
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
		},
	},
});
