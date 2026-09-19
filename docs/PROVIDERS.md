# AI Providers

Phase 2 establishes the provider contract and registry in `apps/backend/src/ai`.

## Current state

- `AiRequest` and `AiResponse` are normalized application contracts.
- `AiProvider` defines capability, execution, and health boundaries.
- `AiProviderRegistry` selects providers by capability and reports unavailable providers truthfully.
- A real Ollama adapter is enabled locally with `llama3.2:latest`.
- An OpenAI-compatible cloud adapter is available but disabled by default.
- The registry checks provider health and can fall back across healthy providers.
- The `unconfigured` adapter remains the honest fallback when Ollama is disabled.

## API checks

- `GET /ai/providers`
- `GET /ai/providers/health`
- `GET /ai/models`
- `GET /ai/capabilities`
- `POST /ai/generate` with `{ "capability": "language", "input": "..." }`

Requests are validated with class-validator DTOs. Invalid input returns `400` with `code: VALIDATION_FAILED`; provider execution failures surface through the normalized error format.

Local configuration uses `OLLAMA_ENABLED`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL` in `.env`. Provider credentials, when added for cloud adapters, must remain server-side and must be validated at startup (the process fails fast when `OPENAI_ENABLED` is set without `OPENAI_API_KEY`).

The capability endpoint reports unsupported vision, embeddings, image, video, and research features as unavailable until a real adapter is configured. It never reports simulated success.
