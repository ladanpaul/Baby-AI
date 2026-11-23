<script setup lang="ts">
useSeoMeta({
  title: 'Chat',
  description:
    'Build and test a self-hosted AI product with Nuxt, Tailwind CSS, and TypeScript.',
});

const composer = ref<HTMLTextAreaElement | null>(null);
const messagesViewport = ref<HTMLElement | null>(null);

const composerStyle = {
  color: '#211913',
  caretColor: '#211913',
  WebkitTextFillColor: '#211913',
};

const userMessageStyle = {
  backgroundColor: '#211913',
  color: '#ffffff',
  borderColor: 'rgba(33, 25, 19, 0.12)',
};

const {
  activeRequestKind,
  canSend,
  draft,
  error,
  isSending,
  messages,
  model,
  resetChat,
  sendMessage,
} = useBabyAiChat();
const {
  runtimeStatus,
  runtimeStatusError,
  runtimeStatusPending,
} = useChatRuntimeStatus();

function focusComposer() {
  composer.value?.focus();
}

function handleSubmit() {
  void sendMessage();
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return;
  }

  event.preventDefault();
  void sendMessage();
}

const sendButtonStyle = computed(() => ({
  backgroundColor: canSend.value ? '#211913' : 'rgba(33, 25, 19, 0.35)',
  color: '#ffffff',
}));

const runtimeBadgeLabel = computed(() => {
  if (runtimeStatusPending.value) {
    return 'Checking';
  }

  if (runtimeStatus.value?.mode === 'mock') {
    return 'Test mode';
  }

  if (runtimeStatus.value?.status === 'connected') {
    return 'Connected';
  }

  if (runtimeStatus.value?.status === 'unreachable') {
    return 'Backend offline';
  }

  return 'Self-hosted';
});

const runtimeBadgeClass = computed(() => {
  if (runtimeStatusPending.value) {
    return 'border border-[rgba(33,25,19,0.14)] bg-[rgba(33,25,19,0.06)] text-[rgba(33,25,19,0.72)]';
  }

  if (runtimeStatus.value?.mode === 'mock') {
    return 'border border-[rgba(176,57,27,0.16)] bg-[rgba(176,57,27,0.08)] text-[rgb(122,47,20)]';
  }

  if (runtimeStatus.value?.status === 'connected') {
    return 'border border-[rgba(13,122,100,0.16)] bg-[rgba(13,122,100,0.08)] text-[rgb(18,98,82)]';
  }

  return 'border border-[rgba(176,57,27,0.16)] bg-[rgba(176,57,27,0.08)] text-[rgb(122,47,20)]';
});

const runtimeBadgeTitle = computed(() => {
  if (runtimeStatusError.value) {
    return runtimeStatusError.value;
  }

  return runtimeStatus.value?.message || '';
});

const modelBadgeLabel = computed(
  () => runtimeStatus.value?.model || model.value || 'dev-mock'
);

watch(
  () => [messages.value.length, isSending.value],
  async () => {
    await nextTick();

    if (!messagesViewport.value) {
      return;
    }

    messagesViewport.value.scrollTop = messagesViewport.value.scrollHeight;
  }
);

onMounted(() => {
  focusComposer();
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-[var(--baby-bg)] text-[var(--baby-ink)]">
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute left-[-10rem] top-[-7rem] h-80 w-80 rounded-full bg-[rgba(216,106,44,0.12)] blur-3xl" />
      <div class="absolute bottom-[-8rem] right-[-5rem] h-80 w-80 rounded-full bg-[rgba(13,122,100,0.12)] blur-3xl" />
    </div>

    <div class="relative mx-auto flex h-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <section class="glass-panel flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem]">
        <header class="shrink-0 flex items-center justify-between gap-3 border-b border-[var(--baby-stroke)] px-4 py-4 sm:px-6">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--baby-ink)] text-sm font-semibold text-white">
              BA
            </div>
            <div>
              <p class="text-base font-semibold">Baby AI</p>
              <p class="text-xs text-[var(--baby-muted)]">
                Self-hosted AI chat
              </p>
            </div>
          </div>

            <div class="flex items-center gap-2">
            <div
              :class="[
                'rounded-full px-3 py-1.5 text-xs font-medium',
                runtimeBadgeClass,
              ]"
              :title="runtimeBadgeTitle || undefined"
            >
              {{ runtimeBadgeLabel }}
            </div>
            <div class="rounded-full border border-[var(--baby-stroke)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--baby-muted)]">
              {{ modelBadgeLabel }}
            </div>
            <button
              class="rounded-full border border-[var(--baby-stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--baby-muted)] transition hover:border-[rgba(216,106,44,0.35)] hover:text-[var(--baby-ink)]"
              type="button"
              @click="resetChat"
            >
              Очистити
            </button>
          </div>
        </header>

        <div
          ref="messagesViewport"
          class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
        >
          <div
            v-if="!messages.length"
            class="flex h-full min-h-80 items-center justify-center"
          >
            <div class="max-w-md text-center">
              <h1 class="text-4xl sm:text-5xl">
                Simple self-hosted chat.
              </h1>
              <p class="mt-4 text-sm leading-7 text-[var(--baby-muted)] sm:text-base">
                Type a message and press Enter.
              </p>
              <p class="mt-2 text-xs text-[var(--baby-muted)]">
                `Shift + Enter` додає новий рядок.
              </p>
            </div>
          </div>

          <article
            v-for="message in messages"
            :key="message.id"
            :class="[
              'max-w-[90%] rounded-[1.5rem] border px-4 py-3 sm:px-5 sm:py-4',
              message.role === 'assistant'
                ? 'mr-auto rounded-bl-md border-[var(--baby-stroke)] bg-white/75'
                : 'ml-auto rounded-br-md',
            ]"
            :style="message.role === 'assistant' ? undefined : userMessageStyle"
          >
            <p
              :class="[
                'text-[0.65rem] font-semibold uppercase tracking-[0.24em]',
                message.role === 'assistant' ? 'text-[var(--baby-highlight)]' : 'text-white/70',
              ]"
            >
              {{ message.role === 'assistant' ? 'Baby AI' : 'You' }}
            </p>
            <p
              v-if="message.kind !== 'image'"
              class="mt-2 whitespace-pre-wrap text-sm leading-7 sm:text-[0.96rem]"
            >
              {{ message.content }}
            </p>
            <div
              v-if="message.kind === 'image'"
              class="mt-2"
            >
              <div
                v-if="message.isPending"
                class="rounded-[1.25rem] border border-[var(--baby-stroke)] bg-[rgba(255,255,255,0.55)] p-4"
              >
                <div class="h-64 animate-pulse rounded-[1rem] bg-[rgba(33,25,19,0.08)]" />
                <p class="mt-3 text-sm text-[var(--baby-muted)]">
                  {{ message.content || message.imagePrompt }}
                </p>
              </div>

              <div v-else-if="message.imageUrl">
                <img
                  :alt="message.imagePrompt || 'Generated image'"
                  :src="message.imageUrl"
                  class="w-full rounded-[1.25rem] border border-[var(--baby-stroke)] object-cover"
                >
                <p
                  v-if="message.content || message.imagePrompt"
                  class="mt-3 text-sm text-[var(--baby-muted)]"
                >
                  {{ message.content || message.imagePrompt }}
                </p>
              </div>
            </div>
            <p
              v-if="message.meta"
              class="mt-3 text-xs text-[var(--baby-muted)]"
            >
              {{ message.meta }}
            </p>
          </article>

          <div
            v-if="isSending && activeRequestKind === 'text'"
            class="mr-auto max-w-[90%] rounded-[1.5rem] rounded-bl-md border border-[var(--baby-stroke)] bg-white/75 px-4 py-3 sm:px-5 sm:py-4"
          >
            <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[var(--baby-highlight)]">
              Baby AI
            </p>
            <div class="mt-2 flex items-center gap-2 text-sm text-[var(--baby-muted)]">
              <span class="h-2 w-2 animate-pulse rounded-full bg-[var(--baby-accent)]" />
              Thinking...
            </div>
          </div>
        </div>

        <div class="shrink-0 border-t border-[var(--baby-stroke)] bg-white/50 px-4 py-4 sm:px-6">
          <p
            v-if="error"
            class="mb-3 rounded-2xl border border-[rgba(176,57,27,0.14)] bg-[rgba(176,57,27,0.08)] px-4 py-3 text-sm text-[rgb(122,47,20)]"
          >
            {{ error }}
          </p>

          <form
            class="flex items-end gap-3"
            @submit.prevent="handleSubmit"
          >
            <textarea
              ref="composer"
              v-model="draft"
              :disabled="isSending"
              class="soft-input min-h-14 max-h-40 resize-y"
              :style="composerStyle"
              maxlength="4000"
              placeholder="Напиши повідомлення або згенеруй зображення..."
              @keydown="handleComposerKeydown"
            />

            <button
              :class="[
                'inline-flex shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition',
                canSend
                  ? 'shadow-[0_16px_30px_rgba(33,25,19,0.18)] hover:-translate-y-0.5'
                  : 'cursor-not-allowed',
              ]"
              :disabled="!canSend"
              :style="sendButtonStyle"
              type="submit"
            >
              {{ isSending ? '...' : 'Send' }}
            </button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>
