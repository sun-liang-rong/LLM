# AI Coding Gateway

OpenAI and Anthropic compatible AI Gateway for coding agents such as Claude Code, Codex CLI, Cline, Roo Code, Continue, and Aider.

## Stack

- Backend: NestJS + Fastify
- Frontend: Vue 3 + Vite + Pinia + Element Plus
- Database: SQLite
- Cache/queue foundation: Redis
- Deployment: Docker Compose, Nginx

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm --filter @gateway/api prisma:generate
pnpm --filter @gateway/shared build
pnpm --filter @gateway/protocol build
pnpm --filter @gateway/api sqlite:init
pnpm dev
```

API: `http://localhost:3000`

Web: `http://localhost:5173`

## Auth / Verification Env

Core auth env vars:

- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`
- `ADMIN_JWT_SECRET`
- `TENANT_JWT_SECRET`
- `ADMIN_SESSION_TTL`
- `TENANT_SESSION_TTL`
- `AUTH_LOGIN_LOCK_THRESHOLD`: consecutive failures before account lock
- `AUTH_LOGIN_LOCK_MINUTES`: temporary lock duration in minutes
- `AUTH_LOGIN_IP_WINDOW_SECONDS`: IP throttling window size in seconds
- `AUTH_LOGIN_IP_MAX_ATTEMPTS`: max failed or throttled attempts allowed per IP window

Verification-related env vars:

- `AUTH_VERIFICATION_ENABLED`: enable verification flow
- `AUTH_VERIFICATION_CHANNEL`: `email` or `sms`
- `AUTH_VERIFICATION_CODE_LENGTH`: default `6`
- `AUTH_VERIFICATION_TTL`: code lifetime in seconds
- `AUTH_VERIFICATION_RESEND_COOLDOWN`: resend cooldown in seconds
- `AUTH_VERIFICATION_MAX_ATTEMPTS`: max verify attempts
- `AUTH_VERIFICATION_DAILY_LIMIT`: daily send limit per identity
- `AUTH_VERIFICATION_DEV_CODE`: local dev fallback code

Email delivery env vars:

- `AUTH_EMAIL_FROM_NAME`
- `AUTH_EMAIL_FROM_ADDRESS`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

When `AUTH_VERIFICATION_ENABLED=false`, registration and login can keep using the current direct flow.
When `AUTH_VERIFICATION_ENABLED=true`, users must request a verification code before completing registration.
If SMTP is not configured, the API will log the verification code locally for development use.
The same verification channel is also used for password reset via `send-password-reset-code` and `reset-password`.
Registration email also includes a verification link that opens `/verify-email` in the web app and can continue the sign-up flow without manually typing the code.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

The production compose stack exposes:

- Gateway API: `http://localhost:3000`
- Admin web via Nginx: `http://localhost:8080`

SQLite data is stored in:

- Local development: `apps/api/data/gateway.db`
- Docker: the `api_data` volume at `/app/data/gateway.db`

## Compatible Endpoints

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`
- `POST /v1/messages/count_tokens`
- `GET /admin/overview`

## Billing Loop

The platform supports the full AI Gateway operating loop:

1. Admins add providers and provider API keys.
2. Admins maintain public models, upstream model names, model groups, and real input/output token costs.
3. Admins create billing groups with a charge multiplier and an optional allowed-model list.
4. Users register, receive signup/check-in balance, and create gateway API keys by choosing a billing group.
5. Each gateway request validates the API key, checks the billing group's model access, routes to an upstream provider, calculates `model cost * billing group multiplier`, deducts user balance, and records the request log.

Model groups are for cataloging models. Billing groups are for access control and charge multipliers.

## Agent Configuration Examples

Claude Code:

```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=<gateway-api-key>
```

OpenAI-compatible clients:

```bash
export OPENAI_BASE_URL=http://localhost:3000/v1
export OPENAI_API_KEY=<gateway-api-key>
```
