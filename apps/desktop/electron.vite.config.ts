// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@core': resolve(__dirname, 'src/core'),
  '@pty': resolve(__dirname, 'src/pty'),
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

export default defineConfig({
  main: {
    resolve: { alias },
    // node-pty + better-sqlite3 are native; keep them external so they load from node_modules.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'pty-host': resolve(__dirname, 'src/main/pty-host.ts')
        }
      }
    }
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
