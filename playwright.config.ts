import 'dotenv/config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'tests/e2e',workers:1, use:{baseURL:'http://localhost:3000',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',args:['--no-sandbox']},trace:'retain-on-failure'}, reporter:'list' });
