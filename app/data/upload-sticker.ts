import { randomUUID } from 'node:crypto'

import sharp from 'sharp'

import { uploadStorage } from './uploads.ts'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Validate, optimize, and persist a sticker image upload.
 * Returns the public URL to use for the sticker `image_url` column.
 */
export async function processStickerUpload(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`unsupported image type: ${file.type}`)
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`image too large (max ${MAX_BYTES / 1024 / 1024} MB)`)
  }

  const buffer = new Uint8Array(await file.arrayBuffer())

  const pipeline = sharp(buffer).withMetadata()
  let outputType: 'jpeg' | 'png'
  let extension: string

  if (file.type === 'image/png') {
    pipeline.png({ compressionLevel: 6, quality: 70 })
    outputType = 'png'
    extension = 'png'
  } else {
    pipeline.jpeg({ mozjpeg: true, quality: 70 })
    outputType = 'jpeg'
    extension = 'jpg'
  }

  const optimized = await pipeline.toBuffer()
  // Copy into a fresh ArrayBuffer-backed Uint8Array so File's BlobPart signature is happy.
  const optimizedView = new Uint8Array(new ArrayBuffer(optimized.byteLength))
  optimizedView.set(optimized)

  const id = randomUUID()
  const key = `stickers/${id}.${extension}`
  const stored = new File([optimizedView], key, {
    type: `image/${outputType}`,
  })

  await uploadStorage.set(key, stored)
  return `/uploads/${key}`
}
