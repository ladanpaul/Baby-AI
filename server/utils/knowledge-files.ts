import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { MultiPartData } from 'h3';

const uploadsDir = join(process.cwd(), '.data', 'uploads');
const maxStoredChars = 120_000;
const maxContextChars = 24_000;

const supportedExtensions = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.html',
  '.xml',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.sql',
  '.py',
  '.java',
  '.go',
  '.rb',
  '.rs',
  '.log',
]);

const supportedMimeTypes = new Set([
  'application/json',
  'application/xml',
  'text/css',
  'text/csv',
  'text/html',
  'text/javascript',
  'text/markdown',
  'text/plain',
  'text/xml',
]);

export interface KnowledgeFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
  textChars: number;
  preview: string;
}

export interface SkippedKnowledgeFile {
  name: string;
  reason: string;
}

interface KnowledgeFileRecord extends KnowledgeFile {
  content: string;
}

function getRecordPath(id: string): string {
  return join(uploadsDir, `${id}.json`);
}

function isSupportedUpload(name: string, contentType: string): boolean {
  const extension = extname(name).toLowerCase();

  if (supportedExtensions.has(extension)) {
    return true;
  }

  if (supportedMimeTypes.has(contentType)) {
    return true;
  }

  return contentType.startsWith('text/');
}

function normalizeDisplayName(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) || 'file.txt';
}

function buildPreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 140);
}

async function ensureUploadsDir(): Promise<void> {
  await mkdir(uploadsDir, { recursive: true });
}

async function readRecord(path: string): Promise<KnowledgeFileRecord | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as KnowledgeFileRecord;
  } catch {
    return null;
  }
}

function toKnowledgeFile(record: KnowledgeFileRecord): KnowledgeFile {
  const { content: _content, ...file } = record;
  return file;
}

function coerceMultipartBuffer(data: MultiPartData['data']): Buffer | null {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === 'string') {
    return Buffer.from(data);
  }

  return null;
}

export async function listKnowledgeFiles(): Promise<KnowledgeFile[]> {
  await ensureUploadsDir();

  const names = await readdir(uploadsDir);
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map((name) => readRecord(join(uploadsDir, name)))
  );

  return records
    .filter((record): record is KnowledgeFileRecord => record !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((record) => toKnowledgeFile(record));
}

export async function saveKnowledgeFiles(parts: MultiPartData[]): Promise<{
  files: KnowledgeFile[];
  skipped: SkippedKnowledgeFile[];
}> {
  await ensureUploadsDir();

  const files: KnowledgeFile[] = [];
  const skipped: SkippedKnowledgeFile[] = [];

  for (const part of parts) {
    if (part.name !== 'files') {
      continue;
    }

    const originalName = part.filename?.trim() || 'unnamed-file';
    const contentType = part.type?.trim() || 'application/octet-stream';

    if (!isSupportedUpload(originalName, contentType)) {
      skipped.push({
        name: originalName,
        reason: 'Only text-like files are supported right now.',
      });
      continue;
    }

    const buffer = coerceMultipartBuffer(part.data);

    if (!buffer || buffer.length === 0) {
      skipped.push({
        name: originalName,
        reason: 'The file was empty.',
      });
      continue;
    }

    const content = buffer.toString('utf8').replace(/\u0000/g, '').trim();

    if (!content) {
      skipped.push({
        name: originalName,
        reason: 'No readable text content was found.',
      });
      continue;
    }

    const id = randomUUID();
    const limitedContent = content.slice(0, maxStoredChars);
    const record: KnowledgeFileRecord = {
      id,
      name: normalizeDisplayName(originalName),
      contentType,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      textChars: limitedContent.length,
      preview: buildPreview(limitedContent),
      content: limitedContent,
    };

    await writeFile(getRecordPath(id), JSON.stringify(record, null, 2), 'utf8');
    files.push(toKnowledgeFile(record));
  }

  return {
    files: files.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    skipped,
  };
}

export async function loadKnowledgeContext(fileIds: string[]): Promise<{
  context: string;
  files: KnowledgeFile[];
}> {
  await ensureUploadsDir();

  const uniqueIds = [...new Set(fileIds.filter((value) => typeof value === 'string' && value.trim().length))];
  const sections: string[] = [];
  const files: KnowledgeFile[] = [];
  let usedChars = 0;

  for (const id of uniqueIds) {
    const record = await readRecord(getRecordPath(id));

    if (!record) {
      continue;
    }

    const remainingChars = maxContextChars - usedChars;

    if (remainingChars <= 0) {
      break;
    }

    const snippet = record.content.slice(0, remainingChars);

    if (!snippet.trim()) {
      continue;
    }

    sections.push(`File: ${record.name}\n${snippet}`);
    usedChars += snippet.length;
    files.push(toKnowledgeFile(record));
  }

  if (!sections.length) {
    return {
      context: '',
      files: [],
    };
  }

  return {
    context: [
      'You have access to uploaded local files. Use them as primary context when they are relevant.',
      'If the answer is not grounded in the uploaded files, say so clearly.',
      ...sections,
    ].join('\n\n---\n\n'),
    files,
  };
}
