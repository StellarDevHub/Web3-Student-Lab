# Playground and generator feature notes

## Playground validation
- The backend now exposes a playground validation endpoint at `/api/v1/playground/validate`.
- It returns lightweight diagnostics for common Rust syntax and delimiter issues so the UI can highlight errors before deployment.

## Generator subscriptions
- The generator endpoint can emit a `generator:ideas` websocket event when `subscribeToUpdates` is set to `true`.
- The payload includes the generated idea, theme, difficulty, and a generated identifier.

## Generator rate limiting
- The generator route now applies a simple per-IP rate limit to avoid abuse of idea generation requests.
- The limit is currently set to three requests per minute per IP.

## OAuth integration
- The backend now exposes GitHub OAuth entry and callback routes at `/api/v1/oauth/github` and `/api/v1/oauth/github/callback`.
- The implementation returns a redirect and a success payload suitable for early integration with a frontend flow.
