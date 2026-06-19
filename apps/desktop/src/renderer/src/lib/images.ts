// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Shared image helpers for card attachments and terminal image-drop.
import type { CardAttachment } from '@shared/types'

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i.test(f.name)

/** Pull the image files out of a drop/paste DataTransfer. */
export function imageFilesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return []
  return Array.from(dt.files).filter(isImageFile)
}

export async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/** Persist a dropped image and return its absolute on-disk path (for typing into a terminal). */
export async function droppedImagePath(file: File): Promise<string> {
  // A File dragged from Finder already has a real path; one from the web/clipboard does not,
  // so we copy its bytes into a temp file via the main process.
  const existing = window.api.media.pathForFile(file)
  if (existing) return existing
  return window.api.media.saveTemp(file.name || 'image.png', await fileBytes(file))
}

/** Quote a path for safe insertion into a prompt/shell line (handles spaces & quotes). */
export function quotePath(p: string): string {
  if (!/[\s'"\\$`]/.test(p)) return p
  return `'${p.replace(/'/g, `'\\''`)}'`
}

/** Attach an image file to a board card; resolves with the stored record (carrying its czfile url). */
export async function attachImageToCard(
  cardId: string,
  projectPath: string,
  file: File
): Promise<CardAttachment> {
  return window.api.board.addAttachment({
    cardId,
    projectPath,
    name: file.name || 'image.png',
    mime: file.type || 'image/png',
    bytes: await fileBytes(file)
  })
}
