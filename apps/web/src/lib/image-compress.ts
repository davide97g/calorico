/**
 * Shrinks a photo in the browser before it is sent anywhere.
 *
 * A phone camera hands us 3-6 MB of 4000 px JPEG for something a vision model
 * reads at ~1500 px. Re-encoding here keeps the request quick on mobile data
 * and — because a canvas round-trip drops every metadata block — strips the GPS
 * coordinates out of the file too.
 *
 * The one caller left is the meal-photo sheet, which overrides both defaults.
 */
const MAX_EDGE = 1400
/** Anything under this is small enough; the loop stops early. */
const TARGET_BYTES = 320 * 1024
const MIN_QUALITY = 0.5
const QUALITY_STEPS = [0.82, 0.7, 0.6, MIN_QUALITY]

export interface CompressedImage {
  blob: Blob
  contentType: string
  width: number
  height: number
}

/** WebP is ~25% smaller than JPEG at the same quality; Safari 14+ can write it. */
function bestFormat(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg'
}

function scaledSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

async function encode(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      type,
      quality,
    )
  })
}

export interface CompressOptions {
  /** Long edge of the output, in pixels. */
  maxEdge?: number
  /** Stop dropping quality once the encode lands under this. */
  targetBytes?: number
}

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image')
  const maxEdge = options.maxEdge ?? MAX_EDGE
  const targetBytes = options.targetBytes ?? TARGET_BYTES

  // `from-image` applies the EXIF orientation, so portrait shots stay upright
  // even though the re-encode throws the EXIF block away.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge)

  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const contentType = bestFormat()
  let blob = await encode(canvas, contentType, QUALITY_STEPS[0]!)
  for (const quality of QUALITY_STEPS.slice(1)) {
    if (blob.size <= targetBytes) break
    blob = await encode(canvas, contentType, quality)
  }

  return { blob, contentType, width, height }
}
