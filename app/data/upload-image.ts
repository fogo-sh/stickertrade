import { randomUUID } from 'node:crypto'

import sharp from 'sharp'

import { uploadStorage } from './uploads.ts'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Typed errors thrown by `processImageUpload`. Controllers can branch on
 * `error.code` to render a stable error code (in JSON) or a friendly
 * message (in HTML).
 */
export class ProcessImageError extends Error {
  constructor(
    public readonly code: 'unsupported_image_type' | 'file_too_large',
    message: string,
  ) {
    super(message)
    this.name = 'ProcessImageError'
  }
}

export interface ProcessImageOptions {
  /** Subdirectory under tmp/uploads to store the file in. */
  folder: string
  /**
   * Optional resize. If provided, the longest edge is clamped to this many
   * pixels (preserves aspect ratio).
   */
  maxEdge?: number
  /** Optional center-crop to a square. Useful for avatars. */
  squareCrop?: boolean
}

/**
 * Validate, optimize, and persist an image upload. Returns the public URL
 * to use for the resulting database column (e.g. avatar_url, image_url).
 * Throws `ProcessImageError` for expected validation failures so
 * controllers can render them as user-facing responses.
 */
export async function processImageUpload(
  file: File,
  options: ProcessImageOptions,
): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ProcessImageError(
      'unsupported_image_type',
      'unsupported image type; please upload a png or jpeg',
    )
  }
  if (file.size > MAX_BYTES) {
    throw new ProcessImageError(
      'file_too_large',
      `image is too large; max ${MAX_BYTES / 1024 / 1024} MiB per file`,
    )
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  let pipeline = sharp(buffer).withMetadata()

  if (options.squareCrop) {
    const size = options.maxEdge ?? 512
    pipeline = pipeline.resize(size, size, { fit: 'cover', position: 'centre' })
  } else if (options.maxEdge) {
    pipeline = pipeline.resize(options.maxEdge, options.maxEdge, {
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  let outputType: 'jpeg' | 'png'
  let extension: string
  if (file.type === 'image/png') {
    pipeline = pipeline.png({ compressionLevel: 6, quality: 70 })
    outputType = 'png'
    extension = 'png'
  } else {
    pipeline = pipeline.jpeg({ mozjpeg: true, quality: 70 })
    outputType = 'jpeg'
    extension = 'jpg'
  }

  const optimized = await pipeline.toBuffer()
  const optimizedView = new Uint8Array(new ArrayBuffer(optimized.byteLength))
  optimizedView.set(optimized)

  const id = randomUUID()
  const key = `${options.folder}/${id}.${extension}`
  const stored = new File([optimizedView], key, { type: `image/${outputType}` })

  await uploadStorage.set(key, stored)
  return `/uploads/${key}`
}

export async function processStickerUpload(file: File): Promise<string> {
  return processImageUpload(file, { folder: 'stickers', maxEdge: 1024 })
}

export async function processAvatarUpload(file: File): Promise<string> {
  return processImageUpload(file, { folder: 'avatars', squareCrop: true, maxEdge: 512 })
}
