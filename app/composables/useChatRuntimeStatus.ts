type ChatRuntimeMode = 'mock' | 'openai-compatible';
type ChatRuntimeStatusKind = 'ready' | 'connected' | 'unreachable';

interface ChatRuntimeStatusResponse {
  mode: ChatRuntimeMode;
  status: ChatRuntimeStatusKind;
  model: string;
  endpoint: string | null;
  availableModels: string[];
  checkedAt: string;
  message: string;
}

export function useChatRuntimeStatus() {
  const state = useState<ChatRuntimeStatusResponse | null>(
    'baby-ai-chat-runtime-status',
    () => null
  );

  const pending = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    pending.value = true;
    error.value = null;

    try {
      state.value = await $fetch<ChatRuntimeStatusResponse>('/api/chat-runtime');
    } catch (requestError) {
      error.value =
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'Could not check the text runtime status.';
    } finally {
      pending.value = false;
    }
  }

  onMounted(() => {
    if (!state.value && !pending.value) {
      void refresh();
    }
  });

  return {
    runtimeStatus: state,
    runtimeStatusError: error,
    runtimeStatusPending: pending,
    refreshRuntimeStatus: refresh,
  };
}
