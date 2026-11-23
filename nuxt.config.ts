import process from 'node:process';

const defaultImageGenerationTimeoutMs = 1000 * 60 * 90;
const defaultChatRuntimeMode = process.env.CHAT_RUNTIME_MODE || 'mock';
const defaultImageWidth = 512;
const defaultImageHeight = 512;
const defaultImageSteps = 2;

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    chatRuntimeMode: defaultChatRuntimeMode,
    chatApiBaseUrl: process.env.CHAT_API_BASE_URL || 'http://127.0.0.1:8000',
    chatCompletionsPath:
      process.env.CHAT_COMPLETIONS_PATH || '/v1/chat/completions',
    chatModelsPath: process.env.CHAT_MODELS_PATH || '/v1/models',
    chatApiKey: process.env.CHAT_API_KEY || '',
    chatModel: process.env.CHAT_MODEL || 'gpt-oss-20b',
    imageModelId:
      process.env.IMAGE_MODEL_ID || 'black-forest-labs/FLUX.1-schnell',
    imageGenerationTimeoutMs: Number(
      process.env.IMAGE_GENERATION_TIMEOUT_MS || defaultImageGenerationTimeoutMs
    ),
    imageWidth: Number(process.env.IMAGE_WIDTH || defaultImageWidth),
    imageHeight: Number(process.env.IMAGE_HEIGHT || defaultImageHeight),
    imageSteps: Number(process.env.IMAGE_STEPS || defaultImageSteps),
    hfToken: process.env.HF_TOKEN || '',
    public: {
      chatRuntimeMode: defaultChatRuntimeMode,
      defaultModel:
        defaultChatRuntimeMode === 'mock'
          ? 'dev-mock'
          : process.env.CHAT_MODEL || 'gpt-oss-20b',
    },
  },
  app: {
    head: {
      title: 'Baby AI',
      titleTemplate: '%s · Baby AI',
      meta: [
        {
          name: 'description',
          content:
            'Self-hosted AI product built with Nuxt, Tailwind CSS, TypeScript, and open model runtimes.',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Space+Grotesk:wght@400;500;700&display=swap',
        },
      ],
    },
  },
})
