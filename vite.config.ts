import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function copyStaticPlugin(): Plugin {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      const files = [
        'app.js',
        'config.js',
        'firebase-config.js',
        'sw.js',
        'firebase-messaging-sw.js',
        'manifest.json',
      ];
      const dirs = ['icons', 'assets'];

      for (const file of files) {
        const src = path.resolve(__dirname, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(distDir, file));
        }
      }
      for (const dir of dirs) {
        const src = path.resolve(__dirname, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, path.join(distDir, dir), { recursive: true });
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), copyStaticPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? { ignored: ['**/*'] } : {},
    },
  };
});
