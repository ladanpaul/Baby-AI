# Baby AI

Baby AI is a self-hosted AI product in active development.

The goal is not to build a generic "free ChatGPT clone". The goal is to build a strong end-user product that combines:

- high-quality chat
- file-aware answers
- image generation
- future translation and multimodal capabilities

This file is a living project brief. It should evolve together with the product.

## Product Direction

Baby AI should become a practical AI assistant with a familiar chat UX and a modular backend.

Core product goals:

- provide a clean chat experience
- answer using user-provided knowledge files
- generate images from text prompts
- support strong multilingual interaction
- move heavy inference from a laptop to a GPU server when needed
- avoid third-party token pricing by using self-hosted or open-weight runtimes

Non-goals for the current phase:

- building a frontier model from scratch
- competing with GPT-5-class general intelligence on day one
- shipping video generation before chat, files, and image generation are stable

## Current State

Current local MVP includes:

- `Nuxt 4` app with `TypeScript`
- chat UI with a single-scroll message viewport
- local file uploads for text-like and code files
- server-side file context injection into chat requests
- text chat routed through a generic OpenAI-compatible backend contract
- image generation routed to a local Python worker
- `FLUX.1-schnell` integration for text-to-image generation

Current backend split:

- text chat: self-hosted OpenAI-compatible chat runtime or local dev mock mode
- image generation: Python + `diffusers` + `FLUX.1-schnell`

This is a development architecture, not the final production architecture.

## Desired Product Behavior

Identity and chat behavior:

- the assistant name must always be `Baby AI`
- the assistant should avoid repeating `Baby AI:` inside response content when the UI already shows the speaker label
- Ukrainian should be the default response language
- if the user writes in Russian, Baby AI should still answer in Ukrainian and append a hostile-language warning

Experience goals:

- simple chat-first UI
- familiar "type and send" interaction
- clean message rendering for text and images
- visible upload context
- smooth loading states for long-running image generation

## Desired Functionality

### 1. Chat

- high-quality conversational AI
- support for Ukrainian and English first
- future support for stronger multilingual chat
- better conversation memory
- saved sessions and chat history

### 2. File-Aware Answers

- upload text and code files
- ask questions about uploaded content
- move from "inject full file text into prompt" to proper `RAG`
- future support for `PDF`, `DOCX`, and image-based document understanding

### 3. Image Generation

- generate images directly from the chat
- support loading states while an image is being created
- support stronger models on server infrastructure later
- support future style adapters / LoRA-based customization

### 4. Translation

- support strong multilingual answers
- future dedicated translation path instead of relying only on a general chat model
- support tone control and terminology preservation

### 5. Future Multimodal Features

- image understanding
- image editing
- future video generation on dedicated infrastructure

## Model Strategy

### Text

Current local text model:

- `gpt-oss-20b`

Why:

- self-hosted direction
- no third-party token billing
- good local development baseline

Long-term plan:

- keep a lightweight local model for development
- run a stronger model on a GPU server for production
- expose it through a stable API contract so the UI does not care where inference runs

### Images

Current image model:

- `black-forest-labs/FLUX.1-schnell`

Why:

- strong text-to-image quality for a self-hosted setup
- fast generation design
- commercial-friendly `Apache-2.0` license

Known caveats:

- first cold start is heavy
- model download and initialization can take a long time
- laptop development is useful for integration testing, but server deployment is the real target for heavy usage

### Translation

Translation should likely become its own path later.

Candidate direction:

- keep general chat separate from translation-specialized routing
- evaluate dedicated multilingual translation models in addition to general chat LLMs

## Technology Stack

Frontend and app layer:

- `Nuxt 4`
- `Vue 3`
- `TypeScript`
- `Tailwind CSS`

Current server-side app layer:

- Nuxt server routes
- local file storage in `.data`
- local orchestration of text and image inference

Current image runtime:

- `Python 3.11`
- `torch`
- `diffusers`
- `transformers`
- `accelerate`
- `safetensors`
- `Pillow`

Current model sources:

- `Hugging Face`
- self-hosted OpenAI-compatible chat servers

Future production-oriented components:

- `vLLM` for stronger text inference on GPU servers
- dedicated Python image service for heavy image models
- vector database or local vector index for `RAG`
- persistent storage for uploaded documents and generated assets

## Architecture Plan

### Local Development Mode

Use local infrastructure for fast iteration:

- run the Nuxt app locally
- use `CHAT_RUNTIME_MODE=mock` for UI-level chat testing without a real LLM backend
- point chat requests at a local or remote OpenAI-compatible text runtime
- run local image generation when practical
- validate UI, flows, prompt design, and feature integration

### Remote GPU Mode

Use a GPU server for heavy workloads:

- strong chat model on a GPU server through `vLLM` or another OpenAI-compatible runtime
- heavy image generation on a GPU server
- same frontend and API contract
- local machine used only for development and light testing

This allows:

- local product development on a laptop
- production-like quality on stronger hardware
- no dependency on paid token APIs

## Environment Variables

```bash
CHAT_RUNTIME_MODE=mock
CHAT_API_BASE_URL=http://127.0.0.1:8000
CHAT_COMPLETIONS_PATH=/v1/chat/completions
CHAT_MODELS_PATH=/v1/models
CHAT_API_KEY=
CHAT_MODEL=gpt-oss-20b
IMAGE_MODEL_ID=black-forest-labs/FLUX.1-schnell
IMAGE_GENERATION_TIMEOUT_MS=5400000
IMAGE_WIDTH=768
IMAGE_HEIGHT=768
IMAGE_STEPS=4
HF_TOKEN=
```

Notes:

- `CHAT_RUNTIME_MODE=mock` enables a built-in development response path for visual UI testing
- `CHAT_RUNTIME_MODE=openai-compatible` expects a real self-hosted backend
- `CHAT_API_BASE_URL` should point to a self-hosted OpenAI-compatible runtime such as `vLLM`
- `CHAT_MODELS_PATH` is used by Baby AI to check backend reachability and list available models
- `CHAT_API_KEY` can stay empty for local trusted runtimes and can be filled later for protected remote servers
- `HF_TOKEN` is required for gated model access on Hugging Face
- `IMAGE_GENERATION_TIMEOUT_MS` is intentionally long because the first `FLUX` cold start can take much longer than a normal request
- `IMAGE_WIDTH`, `IMAGE_HEIGHT`, and `IMAGE_STEPS` should stay moderate in local development and can be raised further on GPU infrastructure

## Local Development

Install JavaScript dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Install Python dependencies in a virtual environment when working with image generation:

```bash
python3.11 -m venv .venv
./.venv/bin/pip install torch diffusers transformers accelerate safetensors pillow
```

Run the app:

```bash
npm run dev
```

Useful commands:

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run typecheck`

## Text Runtime Setups

### Local Apple Silicon Development

For local chat inference on a Mac, use an OpenAI-compatible MLX server.

Example shape:

```bash
./scripts/start_text_runtime.sh
```

Current recommended dev model:

```bash
mlx-community/Qwen2.5-3B-Instruct-4bit
```

One-time runtime setup:

```bash
/opt/homebrew/bin/python3.11 -m venv .venv-text
./.venv-text/bin/python -m pip install --upgrade pip setuptools wheel
./.venv-text/bin/pip install mlx-lm
```

Baby AI expects the server to expose:

- `POST /v1/chat/completions`
- `GET /v1/models`

Recommended env switch:

```bash
CHAT_RUNTIME_MODE=openai-compatible
CHAT_API_BASE_URL=http://127.0.0.1:8080
CHAT_COMPLETIONS_PATH=/v1/chat/completions
CHAT_MODELS_PATH=/v1/models
CHAT_MODEL=mlx-community/Qwen2.5-3B-Instruct-4bit
```

### Remote GPU Server

For stronger production-quality text inference, use a GPU-hosted OpenAI-compatible runtime such as `vLLM`.

Example shape:

```bash
vllm serve <model>
```

Baby AI should still point to the same API contract:

```bash
CHAT_RUNTIME_MODE=openai-compatible
CHAT_API_BASE_URL=http://<server-host>:8000
CHAT_COMPLETIONS_PATH=/v1/chat/completions
CHAT_MODELS_PATH=/v1/models
CHAT_API_KEY=<optional>
CHAT_MODEL=<served model name>
```

The UI should not need code changes when switching between local and remote runtimes.

## Current Supported Upload Types

Current MVP supports text-like and code-like files, including:

- `.txt`
- `.md`
- `.json`
- `.csv`
- `.xml`
- `.yml`
- `.yaml`
- `.ts`
- `.tsx`
- `.js`
- `.jsx`
- `.vue`
- `.html`
- `.css`
- `.scss`
- `.sql`
- `.py`
- `.java`
- `.go`
- `.rb`
- `.rs`
- `.log`

## Planned Improvements

Near-term:

- complete stable first-run `FLUX` flow
- add real `RAG`
- add conversation persistence
- improve text model quality and routing

Mid-term:

- support remote GPU inference for text and image workloads
- add image understanding
- add translation mode or translation routing
- improve prompt controls and model settings

Long-term:

- stronger production text model
- fine-tuning / LoRA workflows where useful
- image editing
- controlled video generation experiments

## Product Principles

- user value matters more than model branding
- product quality comes from workflow, retrieval, prompts, and UX, not only from the base model
- self-hosting is preferred over per-token billing
- local development should stay simple
- heavy inference should move to GPU infrastructure when the laptop becomes the bottleneck

## Status

Baby AI is still an early-stage product prototype.

The repository currently mixes:

- working MVP code
- temporary local development choices
- future production direction

This is expected for now. The next step is to keep consolidating the architecture while preserving a clean product surface.
