import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";

const TARGET_SIZE_KB = 500;
const THRESHOLD_SIZE_KB = 1024;
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const PNG_QUALITY_STEPS = [80, 70, 60, 50, 40];
const JPG_QUALITY_STEPS = [80, 70, 60, 50, 40];
const RESIZE_SCALE_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5];

async function getImageFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.isFile() && SUPPORTED_EXTENSIONS.has(extname(e.name).toLowerCase()),
    )
    .map((e) => join(dir, e.name));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function compressPng(
  filePath: string,
  targetBytes: number,
): Promise<Buffer> {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  let bestBuffer: Buffer | null = null;

  for (const quality of PNG_QUALITY_STEPS) {
    const buf = await sharp(filePath)
      .png({ quality, compressionLevel: 9, palette: true })
      .toBuffer();

    bestBuffer = buf;
    if (buf.length <= targetBytes) return buf;
  }

  for (const scale of RESIZE_SCALE_STEPS) {
    const w = Math.round((metadata.width ?? 1) * scale);
    const h = Math.round((metadata.height ?? 1) * scale);

    const buf = await sharp(filePath)
      .resize(w, h)
      .png({ quality: 60, compressionLevel: 9, palette: true })
      .toBuffer();

    bestBuffer = buf;
    if (buf.length <= targetBytes) return buf;
  }

  return bestBuffer!;
}

async function compressJpeg(
  filePath: string,
  targetBytes: number,
): Promise<Buffer> {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  let bestBuffer: Buffer | null = null;

  for (const quality of JPG_QUALITY_STEPS) {
    const buf = await sharp(filePath)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    bestBuffer = buf;
    if (buf.length <= targetBytes) return buf;
  }

  for (const scale of RESIZE_SCALE_STEPS) {
    const w = Math.round((metadata.width ?? 1) * scale);
    const h = Math.round((metadata.height ?? 1) * scale);

    const buf = await sharp(filePath)
      .resize(w, h)
      .jpeg({ quality: 60, mozjpeg: true })
      .toBuffer();

    bestBuffer = buf;
    if (buf.length <= targetBytes) return buf;
  }

  return bestBuffer!;
}

async function compressWebp(
  filePath: string,
  targetBytes: number,
): Promise<Buffer> {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  let bestBuffer: Buffer | null = null;

  for (const quality of JPG_QUALITY_STEPS) {
    const buf = await sharp(filePath).webp({ quality }).toBuffer();

    bestBuffer = buf;
    if (buf.length <= targetBytes) return buf;
  }

  for (const scale of RESIZE_SCALE_STEPS) {
    const w = Math.round((metadata.width ?? 1) * scale);
    const h = Math.round((metadata.height ?? 1) * scale);

    const buf = await sharp(filePath)
      .resize(w, h)
      .webp({ quality: 60 })
      .toBuffer();

    bestBuffer = buf;
    if (buf.length <= targetBytes) return buf;
  }

  return bestBuffer!;
}

async function compressImage(filePath: string): Promise<void> {
  const ext = extname(filePath).toLowerCase();
  const originalSize = (await stat(filePath)).size;
  const targetBytes = TARGET_SIZE_KB * 1024;

  let buffer: Buffer;
  if (ext === ".png") {
    buffer = await compressPng(filePath, targetBytes);
  } else if (ext === ".jpg" || ext === ".jpeg") {
    buffer = await compressJpeg(filePath, targetBytes);
  } else {
    buffer = await compressWebp(filePath, targetBytes);
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buffer);

  const newSize = buffer.length;
  const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
  console.log(
    `  ${filePath.split("/").pop()}: ${formatSize(originalSize)} → ${formatSize(newSize)} (-${reduction}%)`,
  );
}

async function main() {
  const dir = process.argv[2] ?? "assets";
  const targetDir = join(process.cwd(), dir);

  console.log(`\n🍁 扫描目录: ${targetDir}\n`);

  const files = await getImageFiles(targetDir);
  if (files.length === 0) {
    console.log("未找到图片文件");
    return;
  }

  const thresholdBytes = THRESHOLD_SIZE_KB * 1024;
  let compressed = 0;
  let skipped = 0;

  for (const file of files) {
    const size = (await stat(file)).size;
    if (size < thresholdBytes) {
      skipped++;
      continue;
    }

    console.log(`压缩中: ${file.split("/").pop()} (${formatSize(size)})`);
    await compressImage(file);
    compressed++;
  }

  console.log(
    `\n✅ 完成: ${compressed} 张已压缩, ${skipped} 张已跳过 (< ${THRESHOLD_SIZE_KB} KB)\n`,
  );
}

main();
