import type { NativeImage } from 'electron';
import type { ComputerPixels, ComputerRect, ComputerSize } from '../shared/computer-views.js';
import { detailSize, overviewSize, validateSourceRect } from './computer-views.js';

export interface DecodedComputerImage extends ComputerPixels { png: string; }
export interface ProcessedComputerImage extends ComputerSize { base64: string; }
export interface ComputerImageProcessor {
  decode(pngBase64: string, size: ComputerSize): DecodedComputerImage;
  overview(image: DecodedComputerImage, divisor: number): ProcessedComputerImage;
  crop(image: DecodedComputerImage, rect: ComputerRect, divisor?: number): ProcessedComputerImage;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Check encoded dimensions before handing the compressed image to Electron. */
function pngBytes(base64: string, size: ComputerSize): Buffer {
  overviewSize(size, 1);
  if (size.width > 32768 || size.height > 32768 || size.width > 40_000_000 / size.height) throw new Error('Computer PNG exceeds the capture size limit.');
  if (typeof base64 !== 'string' || !base64.length || base64.length > 56_000_000 || base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) {
    throw new Error('Invalid computer PNG encoding.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64 || bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR'
    || bytes.readUInt32BE(16) !== size.width || bytes.readUInt32BE(20) !== size.height) {
    throw new Error('Computer PNG dimensions do not match the physical capture.');
  }
  let offset = 8, sawPixels = false, sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (length > bytes.length - offset - 12) throw new Error('Truncated computer PNG.');
    if (type === 'IDAT') sawPixels = true;
    offset += length + 12;
    if (type === 'IEND') { sawEnd = length === 0 && offset === bytes.length; break; }
  }
  if (!sawPixels || !sawEnd) throw new Error('Incomplete computer PNG.');
  return bytes;
}

function assertNativeSize(image: NativeImage, size: ComputerSize): void {
  const actual = image.getSize(1);
  if (image.isEmpty() || actual.width !== size.width || actual.height !== size.height
    || image.getScaleFactors().some(scale => scale !== 1)) {
    throw new Error('Computer image is not a scale-1 physical pixel image.');
  }
}

/** Load Electron only for the production adapter; geometry and ports stay Node-testable. */
export async function createComputerImageProcessor(): Promise<ComputerImageProcessor> {
  const { nativeImage } = await import('electron');
  const decoded = new WeakMap<DecodedComputerImage, { image: NativeImage; width: number; height: number; png: string }>();
  function original(image: DecodedComputerImage): { image: NativeImage; png: string } {
    const stored = decoded.get(image);
    if (!stored || image.width !== stored.width || image.height !== stored.height) throw new Error('Computer image was not decoded by this processor.');
    return stored;
  }
  function encode(image: NativeImage, size: ComputerSize): ProcessedComputerImage {
    assertNativeSize(image, size);
    const base64 = image.toPNG({ scaleFactor: 1 }).toString('base64');
    pngBytes(base64, size);
    return { base64, width: size.width, height: size.height };
  }
  return {
    decode(png, size) {
      const bytes = pngBytes(png, size);
      const image = nativeImage.createFromBuffer(bytes, { scaleFactor: 1 });
      assertNativeSize(image, size);
      const data = image.toBitmap({ scaleFactor: 1 });
      if (data.length !== size.width * size.height * 4) throw new Error('Computer image has an invalid BGRA bitmap.');
      const result: DecodedComputerImage = { png, width: size.width, height: size.height, data };
      decoded.set(result, { image, width: size.width, height: size.height, png });
      return result;
    },
    overview(image, divisor) {
      const source = original(image), size = overviewSize(image, divisor);
      if (size.width === image.width && size.height === image.height) return { base64: source.png, ...size };
      return encode(source.image.resize({ width: size.width, height: size.height, quality: 'best' }), size);
    },
    crop(image, rect, divisor = 1) {
      const source = original(image), valid = validateSourceRect(rect, image);
      const size = detailSize(valid, divisor), crop = source.image.crop(valid);
      return encode(size.width === valid.width && size.height === valid.height ? crop
        : crop.resize({ width: size.width, height: size.height, quality: 'best' }), size);
    },
  };
}
