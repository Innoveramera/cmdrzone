// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

/// <reference types="vite/client" />
import type { DesktopApi } from '@shared/api'

declare global {
  interface Window {
    api: DesktopApi
  }
}

export {}
