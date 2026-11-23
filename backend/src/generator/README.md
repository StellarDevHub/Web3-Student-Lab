# AI hackathon idea generator — safety guardrails (#908)

`POST /api/generator/generate` calls an OpenAI-backed model to produce
structured hackathon project ideas. To keep generated content safe,
on-schema, and resistant to prompt injection, the endpoint enforces:

- **Output contract** (`ideaSchema.ts`): every idea returned to the
  frontend is validated against `ProjectIdeaSchema` (Zod). Model output
  that doesn't conform is rejected rather than passed through.
- **Prompt-injection resistance** (`generator.service.ts`): the system
  prompt explicitly instructs the model to ignore any instructions
  embedded in user-supplied text, and user input is passed as clearly
  delimited content rather than concatenated into the instruction set.
- **Safe fallback**: when generation fails or returns invalid output,
  the API responds with an actionable error rather than surfacing raw
  model output or a silent empty result.
- **Evaluation suite** (`backend/tests/generatorIdeaSafety.eval.test.ts`):
  a deterministic test suite exercising harmful, malformed, and
  off-topic model responses against mocked model output — no live,
  paid API calls are made in CI.
