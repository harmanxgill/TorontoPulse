import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Proxies /toronto-api/* → https://ckan0.cf.opendata.inter.prod-toronto.ca/*
      // Bypasses CORS — the browser talks to localhost, Vite forwards server-side.
      '/toronto-api': {
        target: 'https://ckan0.cf.opendata.inter.prod-toronto.ca',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/toronto-api/, ''),
      },
    },
  },
});
