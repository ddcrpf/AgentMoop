import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ plugins:[react()], build:{ outDir:'dist', emptyOutDir:true, rollupOptions:{input:{app:resolve(import.meta.dirname,'index.html'),landing:resolve(import.meta.dirname,'landing.html')}} }, server:{ proxy:{ '/api':'http://127.0.0.1:3434', '/authorize':'http://127.0.0.1:3434' } } });
