import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolveImageRenderSettings } from '../utils/image-generation';

const execFileAsync = promisify(execFile);
const outputDir = join(process.cwd(), '.data', 'generated-images');
const stalePartialThresholdMs = 1000 * 60 * 30;

interface ImageRequestBody {
  prompt?: string;
}

interface ImageGeneratorPayload {
  output_path: string;
  model_id: string;
  device: string;
  duration_ms: number;
  width: number;
  height: number;
}

const defaultImageGenerationTimeoutMs = 1000 * 60 * 90;

function getPythonBin(): string {
  return join(process.cwd(), '.venv', 'bin', 'python');
}

function getGeneratorScriptPath(): string {
  return join(process.cwd(), 'scripts', 'generate_image.py');
}

function getHubCacheModelDir(modelId: string): string {
  return join(
    homedir(),
    '.cache',
    'huggingface',
    'hub',
    `models--${modelId.replace(/\//g, '--')}`
  );
}

async function cleanupStalePartials(modelId: string) {
  const modelDir = getHubCacheModelDir(modelId);
  const blobsDir = join(modelDir, 'blobs');
  const locksDir = join(
    homedir(),
    '.cache',
    'huggingface',
    'hub',
    '.locks',
    `models--${modelId.replace(/\//g, '--')}`
  );

  let entries: string[];

  try {
    entries = await readdir(blobsDir);
  } catch {
    return;
  }

  const now = Date.now();

  await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.incomplete'))
      .map(async (entry) => {
        const partialPath = join(blobsDir, entry);

        try {
          const partialStat = await stat(partialPath);

          if (now - partialStat.mtimeMs < stalePartialThresholdMs) {
            return;
          }

          await rm(partialPath, { force: true });

          const lockName = `${entry.split('.', 1)[0]}.lock`;
          await rm(join(locksDir, lockName), { force: true });
        } catch {
          // Best-effort cleanup only. Generation should continue even if stale
          // cache artifacts cannot be removed.
        }
      })
  );
}

function getImageGenerationErrorMessage(error: Error & { stderr?: string }): string {
  const stderr = error.stderr?.trim();

  if (stderr?.includes('FLUX.1-schnell requires Hugging Face access')) {
    return stderr;
  }

  if (error.message.includes('timed out')) {
    return [
      'Image generation timed out while FLUX was still downloading or booting.',
      'On first run this can take a long time.',
      'Retry the same prompt once the model cache has finished warming up.',
    ].join(' ');
  }

  return stderr || error.message || 'Image generation failed.';
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<ImageRequestBody>(event);
  const prompt = body.prompt?.trim();

  if (!prompt) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Image prompt is required.',
    });
  }

  await mkdir(outputDir, { recursive: true });
  await cleanupStalePartials(config.imageModelId);

  const outputPath = join(outputDir, `${randomUUID()}.png`);
  const imageGenerationTimeoutMs =
    Number(config.imageGenerationTimeoutMs) || defaultImageGenerationTimeoutMs;
  const imageRenderSettings = resolveImageRenderSettings({
    prompt,
    defaultWidth: Number(config.imageWidth) || 768,
    defaultHeight: Number(config.imageHeight) || 768,
    defaultSteps: Number(config.imageSteps) || 4,
  });

  let stdout = '';
  let stderr = '';

  try {
    const result = await execFileAsync(
      getPythonBin(),
      [
        getGeneratorScriptPath(),
        '--prompt',
        prompt,
        '--output',
        outputPath,
        '--model-id',
        config.imageModelId,
        '--width',
        `${imageRenderSettings.width}`,
        '--height',
        `${imageRenderSettings.height}`,
        '--steps',
        `${imageRenderSettings.steps}`,
      ],
      {
        cwd: process.cwd(),
        timeout: imageGenerationTimeoutMs,
        maxBuffer: 1024 * 1024 * 8,
        env: {
          ...process.env,
          HF_TOKEN: config.hfToken,
          PYTORCH_ENABLE_MPS_FALLBACK: '1',
        },
      }
    );

    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const executionError = error as Error & {
      stdout?: string;
      stderr?: string;
    };

    throw createError({
      statusCode: 500,
      statusMessage: getImageGenerationErrorMessage(executionError),
    });
  }

  const generatorPayload = JSON.parse(stdout.trim()) as ImageGeneratorPayload;
  const imageBuffer = await readFile(generatorPayload.output_path);

  return {
    prompt,
    modelId: generatorPayload.model_id,
    device: generatorPayload.device,
    durationMs: generatorPayload.duration_ms,
    width: generatorPayload.width,
    height: generatorPayload.height,
    mimeType: 'image/png',
    imageBase64: imageBuffer.toString('base64'),
    stderr: stderr.trim() || null,
  };
});
