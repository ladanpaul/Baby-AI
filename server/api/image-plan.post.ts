import {
  buildOpenAiCompatibleEndpoint,
  requestOpenAiCompatibleText,
  type OpenAiCompatibleTextMessage,
} from '../utils/openai-compatible';

interface ImagePlanRequestBody {
  content?: string;
  previousImagePrompt?: string;
}

interface ImageSceneBrief {
  subject?: string;
  composition?: string;
  environment?: string;
  lighting?: string;
  camera?: string;
  style?: string;
  keyDetails?: string[];
  avoid?: string[];
}

interface ImagePlanPayload {
  status?: 'ready' | 'clarify';
  promptEn?: string;
  clarification?: string;
  brief?: ImageSceneBrief;
}

const imagePlannerSystemPrompt = [
  'You are the Baby AI image planner.',
  'Turn natural user language into a structured visual scene brief and one final English prompt for FLUX text-to-image generation.',
  'Return valid JSON only with this exact schema:',
  '{"status":"ready|clarify","promptEn":"","clarification":"","brief":{"subject":"","composition":"","environment":"","lighting":"","camera":"","style":"","keyDetails":[],"avoid":[]}}',
  'Rules:',
  '- If the user clearly wants an image and there is enough information, return status "ready".',
  '- If the request is genuinely underspecified, return status "clarify" and ask one short clarification question in Ukrainian.',
  '- If previousImagePrompt exists, treat the user message as either a refinement or a replacement. Preserve the main subject unless the user clearly changes it.',
  '- promptEn must be compact, visual, and FLUX-friendly.',
  '- promptEn must be in English only.',
  '- Preserve exact product/object identity when provided: brand, model, year, body type, door count, finish, angle, environment, lighting, lens, and style.',
  '- Do not invent a different subject.',
  '- Keep the prompt concise but specific.',
  '- brief.keyDetails should contain the most important concrete constraints.',
  '- brief.avoid should contain obvious things that must not happen when useful.',
  '- Never return markdown or extra commentary.',
  'Example:',
  '{"status":"ready","promptEn":"2019 Audi A5 Sportback, black body, full chrome delete, five-door sportback body, front three-quarter view, golden hour automotive photography, realistic reflections, telephoto lens, full-frame Nikon","clarification":"","brief":{"subject":"2019 Audi A5 Sportback","composition":"front three-quarter view","environment":"outdoor driveway","lighting":"golden hour","camera":"telephoto lens on a full-frame Nikon","style":"realistic automotive photography","keyDetails":["black body","full chrome delete","five-door sportback body"],"avoid":["generic sedan","silver body","winter scene"]}}',
].join('\n');

function extractJsonObject(content: string): ImagePlanPayload | null {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed) as ImagePlanPayload;
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as ImagePlanPayload;
    } catch {
      return null;
    }
  }
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeBrief(brief: unknown): ImageSceneBrief {
  if (!brief || typeof brief !== 'object') {
    return {};
  }

  const candidate = brief as Record<string, unknown>;

  return {
    subject: typeof candidate.subject === 'string' ? candidate.subject.trim() : '',
    composition:
      typeof candidate.composition === 'string' ? candidate.composition.trim() : '',
    environment:
      typeof candidate.environment === 'string' ? candidate.environment.trim() : '',
    lighting: typeof candidate.lighting === 'string' ? candidate.lighting.trim() : '',
    camera: typeof candidate.camera === 'string' ? candidate.camera.trim() : '',
    style: typeof candidate.style === 'string' ? candidate.style.trim() : '',
    keyDetails: normalizeList(candidate.keyDetails),
    avoid: normalizeList(candidate.avoid),
  };
}

function buildProgressSummary(brief: ImageSceneBrief, promptEn: string): string {
  const subject = brief.subject?.trim() || '';
  const details = (brief.keyDetails || []).slice(0, 2).join(', ').trim();

  if (subject && details) {
    return `Генерую зображення: ${subject} — ${details}.`;
  }

  if (subject) {
    return `Генерую зображення: ${subject}.`;
  }

  if (promptEn.trim()) {
    const shortPrompt = promptEn.split(',').slice(0, 2).join(',').trim();
    return shortPrompt
      ? `Генерую зображення: ${shortPrompt}.`
      : 'Генерую зображення за твоїм описом.';
  }

  return 'Генерую зображення за твоїм описом.';
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<ImagePlanRequestBody>(event);
  const content = body.content?.trim() || '';
  const previousImagePrompt = body.previousImagePrompt?.trim() || '';

  if (!content) {
    throw createError({
      statusCode: 400,
      statusMessage: 'An image request is required to build an image plan.',
    });
  }

  if (config.chatRuntimeMode === 'mock') {
    return {
      status: 'ready' as const,
      promptEn: content,
      clarification: '',
      summaryUk: 'Генерую зображення за твоїм описом.',
      brief: {
        subject: '',
        composition: '',
        environment: '',
        lighting: '',
        camera: '',
        style: '',
        keyDetails: [],
        avoid: [],
      },
    };
  }

  const userContext = previousImagePrompt
    ? [
        `currentUserMessage: ${content}`,
        `previousImagePrompt: ${previousImagePrompt}`,
      ].join('\n')
    : `currentUserMessage: ${content}`;

  const messages: OpenAiCompatibleTextMessage[] = [
    { role: 'system', content: imagePlannerSystemPrompt },
    { role: 'user', content: userContext },
  ];

  const response = await requestOpenAiCompatibleText({
    apiKey: config.chatApiKey,
    endpoint: buildOpenAiCompatibleEndpoint(
      config.chatApiBaseUrl,
      config.chatCompletionsPath
    ),
    messages,
    model: config.chatModel,
    temperature: 0,
    maxTokens: 400,
    timeoutMs: 60_000,
  });

  const payload = extractJsonObject(response.content);

  if (!payload) {
    throw createError({
      statusCode: 502,
      statusMessage: 'The text runtime returned an invalid image plan payload.',
    });
  }

  const brief = normalizeBrief(payload.brief);
  const status = payload.status === 'clarify' ? 'clarify' : 'ready';
  const promptEn = payload.promptEn?.trim() || '';
  const clarification = payload.clarification?.trim() || '';

  return {
    status,
    promptEn,
    clarification,
    summaryUk: buildProgressSummary(brief, promptEn),
    brief,
  };
});
