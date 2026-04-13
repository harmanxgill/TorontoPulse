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
      // Proxies /ttc-gtfs/* → https://gtfs.torontotransit.com/*
      // TTC GTFS-Realtime protobuf feed (no CORS headers on their end).
      '/ttc-gtfs': {
        target: 'https://gtfs.torontotransit.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ttc-gtfs/, ''),
      },
    },
  },
});
