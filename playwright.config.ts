import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,globalSetup:'./tests/e2e/global-setup.ts',use:{baseURL:'http://localhost:3435',headless:true},
  webServer:{command:'rm -rf /private/tmp/pingme-e2e && npm run build:web && node --env-file=clerk_env.env --import tsx src/http/server.ts',url:'http://localhost:3435/healthz',reuseExistingServer:false,
    env:{PUBLIC_BASE_URL:'http://localhost:3435',PORT:'3435',ALLOW_HTTP_LOOPBACK:'true',DATA_DIR:'/private/tmp/pingme-e2e'}}});
