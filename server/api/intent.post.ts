import {
  buildOpenAiCompatibleEndpoint,
  requestOpenAiCompatibleText,
  type OpenAiCompatibleTextMessage,
} from '../utils/openai-compatible';

interface IntentRequestBody {
  content?: string;
  previousImagePrompt?: string;
}

type RoutedIntent = 'chat' | 'image' | 'clarify-image';

interface IntentRoutePayload {
  intent?: RoutedIntent;
  imagePrompt?: string;
  progressMessage?: string;
  clarification?: string;
}

interface ImageRefinementPayload {
  imagePrompt?: string;
  clarification?: string;
}

const intentRouterSystemPrompt = [
  'You are the Baby AI intent router.',
  'Return valid JSON only with this exact schema:',
  '{"intent":"chat|image|clarify-image","imagePrompt":"","progressMessage":"","clarification":""}',
  'Rules:',
  '- Use "image" when the user wants a static image, photo, illustration, render, logo, poster, avatar, wallpaper, or similar visual asset.',
  '- Use "clarify-image" when the user probably wants an image but has not described enough detail to generate it well.',
  '- If previousImagePrompt is present and the user message looks like a follow-up refinement, keep the same image subject and merge the new constraints into a full new imagePrompt.',
  '- Use "chat" for normal conversation, coding, planning, explanation, translation, or any non-image task.',
  '- For "image", write imagePrompt in compact natural English optimized for text-to-image generation.',
  '- Preserve important object, brand, model, year, composition, lighting, lens, and style details in imagePrompt.',
  '- Never drop the main subject from previousImagePrompt during a refinement request unless the user clearly asks for a different subject.',
  '- Remove greetings, filler words, and polite phrases from imagePrompt.',
  '- For "image", write progressMessage in short natural Ukrainian, confirming what is being generated without repeating the full request.',
  '- For "clarify-image", write clarification as one short Ukrainian question asking for the missing details.',
  '- Never wrap JSON in markdown.',
  '- Never add extra keys or commentary.',
  'Examples:',
  'User: "Привіт, згенеруй будь ласка фотку Audi A5 2019 в чорному кузові, golden hour"',
  'Output: {"intent":"image","imagePrompt":"2019 Audi A5 Sportback, black body, front three-quarter view, golden hour automotive photography, realistic reflections, telephoto lens, full-frame Nikon","progressMessage":"Генерую зображення: чорний Audi A5 2019 по заданих критеріях.","clarification":""}',
  'User: "створи картинку"',
  'Output: {"intent":"clarify-image","imagePrompt":"","progressMessage":"","clarification":"Уточни, будь ласка, що саме ти хочеш згенерувати: обʼєкт, стиль, ракурс чи атмосферу?"}',
  'User: "згенеруй regex для email"',
  'Output: {"intent":"chat","imagePrompt":"","progressMessage":"","clarification":""}',
].join('\n');

const imageRefinementSystemPrompt = [
  'You rewrite follow-up image edits for Baby AI.',
  'Return valid JSON only with this exact schema:',
  '{"imagePrompt":"","clarification":""}',
  'Rules:',
  '- You will receive a previous image prompt and a short follow-up user instruction.',
  '- Merge the follow-up instruction into the previous image prompt and return one full new English text-to-image prompt.',
  '- Preserve the main subject from the previous image prompt.',
  '- Apply the new constraints precisely.',
  '- Do not change the subject unless the user explicitly asks for a different subject.',
  '- If the follow-up is too ambiguous even with the previous prompt, leave imagePrompt empty and ask one short clarification question in Ukrainian in clarification.',
  '- Never return markdown.',
  '- Never add extra keys or commentary.',
  'Example input:',
  'previousImagePrompt: "2019 Audi A5 Sportback, black body, front three-quarter view, golden hour automotive photography"',
  'followUp: "давай щоб було 5 дверей в ній а не 4, і повний антихром"',
  'Example output:',
  '{"imagePrompt":"2019 Audi A5 Sportback, black body, full chrome delete, five-door sportback body, front three-quarter view, golden hour automotive photography","clarification":""}',
].join('\n');

const nonImageTaskPattern =
  /\b(regex|код|code|sql|json|yaml|план|лист|email|e-mail|документ|translate|переклад)\b/iu;
const standaloneImageLeadPattern =
  /^(згенеруй|намалюй|створи|зроби|покажи|generate|draw|render|create|make|show)\b/iu;

function extractJsonObject(content: string): IntentRoutePayload | null {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed) as IntentRoutePayload;
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as IntentRoutePayload;
    } catch {
      return null;
    }
  }
}

function extractRefinementJsonObject(content: string): ImageRefinementPayload | null {
  const payload = extractJsonObject(content);

  if (!payload) {
    return null;
  }

  return {
    imagePrompt: payload.imagePrompt?.trim() || '',
    clarification: payload.clarification?.trim() || '',
  };
}

function looksLikeImageRefinement(
  content: string,
  previousImagePrompt: string
): boolean {
  if (!previousImagePrompt.trim()) {
    return false;
  }

  const normalized = content.trim().toLowerCase();

  if (!normalized || nonImageTaskPattern.test(normalized)) {
    return false;
  }

  return (
    startsLikeImageRefinement(normalized) ||
    includesImageRefinementReference(normalized) ||
    normalized.length <= 140
  );
}

function startsLikeImageRefinement(content: string): boolean {
  return [
    'давай',
    'а давай',
    'і давай',
    'і ще',
    'і щоб',
    'щоб',
    'зроби',
    'перероби',
    'поміняй',
    'додай',
    'прибери',
    'нехай буде',
    'make it',
    'change it',
    'adjust it',
    'update it',
    'and make it',
    'also make it',
    'remove',
    'add',
    'without',
    'with',
  ].some((prefix) => content.startsWith(prefix));
}

function includesImageRefinementReference(content: string): boolean {
  return [
    'в ній',
    'в ньому',
    'у ній',
    'у ньому',
    'в неї',
    'в него',
    ' it ',
    ' this one',
    ' that one',
    'там',
    'ця',
    'цей',
    'цю',
  ].some((fragment) => content.includes(fragment));
}

function looksLikeStandaloneImageRequest(content: string): boolean {
  return standaloneImageLeadPattern.test(content);
}

function startsWithStrongImageCommand(content: string): boolean {
  return [
    'згенеруй',
    'намалюй',
    'зрендери',
    'рендерни',
    'generate',
    'draw',
    'render',
    'illustrate',
    'sketch',
  ].some((prefix) => content.startsWith(prefix));
}

function normalizeIntentPayload(payload: IntentRoutePayload): IntentRoutePayload {
  const intent = payload.intent === 'image' || payload.intent === 'clarify-image'
    ? payload.intent
    : 'chat';

  return {
    intent,
    imagePrompt: payload.imagePrompt?.trim() || '',
    progressMessage: payload.progressMessage?.trim() || '',
    clarification: payload.clarification?.trim() || '',
  };
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<IntentRequestBody>(event);
  const content = body.content?.trim() || '';
  const previousImagePrompt = body.previousImagePrompt?.trim() || '';

  if (!content) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A user message is required to route intent.',
    });
  }

  if (config.chatRuntimeMode === 'mock') {
    return {
      intent: 'chat' as const,
      imagePrompt: '',
      progressMessage: '',
      clarification: '',
    };
  }

  if (
    !previousImagePrompt &&
    startsWithStrongImageCommand(content.toLowerCase()) &&
    !nonImageTaskPattern.test(content.toLowerCase())
  ) {
    return {
      intent: 'image' as const,
      imagePrompt: '',
      progressMessage: '',
      clarification: '',
    };
  }

  if (
    !previousImagePrompt &&
    !looksLikeStandaloneImageRequest(content.toLowerCase()) &&
    (startsLikeImageRefinement(content.toLowerCase()) ||
      includesImageRefinementReference(content.toLowerCase()))
  ) {
    return {
      intent: 'clarify-image' as const,
      imagePrompt: '',
      progressMessage: '',
      clarification:
        'Уточни, будь ласка, що саме треба змінити або згенерувати, бо зараз у чаті немає попереднього зображення для такого уточнення.',
    };
  }

  if (looksLikeImageRefinement(content, previousImagePrompt)) {
    const refinementMessages: OpenAiCompatibleTextMessage[] = [
      { role: 'system', content: imageRefinementSystemPrompt },
      {
        role: 'user',
        content: [
          `previousImagePrompt: ${previousImagePrompt}`,
          `followUp: ${content}`,
        ].join('\n'),
      },
    ];

    const refinementResponse = await requestOpenAiCompatibleText({
      apiKey: config.chatApiKey,
      endpoint: buildOpenAiCompatibleEndpoint(
        config.chatApiBaseUrl,
        config.chatCompletionsPath
      ),
      messages: refinementMessages,
      model: config.chatModel,
      temperature: 0,
      maxTokens: 220,
      timeoutMs: 60_000,
    });

    const refinementPayload = extractRefinementJsonObject(
      refinementResponse.content
    );

    if (refinementPayload?.imagePrompt) {
      return {
        intent: 'image' as const,
        imagePrompt: refinementPayload.imagePrompt,
        progressMessage: '',
        clarification: '',
      };
    }

    return {
      intent: 'clarify-image' as const,
      imagePrompt: '',
      progressMessage: '',
      clarification:
        refinementPayload?.clarification ||
        'Уточни, будь ласка, які саме зміни треба внести в попереднє зображення.',
    };
  }

  const userContext = previousImagePrompt
    ? [
        `Current user message: ${content}`,
        `Previous image prompt in this conversation: ${previousImagePrompt}`,
      ].join('\n')
    : `Current user message: ${content}`;

  const messages: OpenAiCompatibleTextMessage[] = [
    { role: 'system', content: intentRouterSystemPrompt },
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
    maxTokens: 220,
    timeoutMs: 60_000,
  });

  const payload = extractJsonObject(response.content);

  if (!payload) {
    throw createError({
      statusCode: 502,
      statusMessage: 'The text runtime returned an invalid intent payload.',
    });
  }

  return normalizeIntentPayload(payload);
});
