# One Horizon webhooks on Vercel

Clone this when your One Horizon app needs a webhook endpoint on Vercel. It is only the Vercel version: one serverless function, one shared handler, no other host config.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/onehorizonai/webhook-template-vercel&env=ONE_WEBHOOK_KEY,ONE_API_KEY&envDescription=Paste%20ONE_WEBHOOK_KEY%20from%20your%20One%20Horizon%20webhook%20settings.%20ONE_API_KEY%20is%20optional%20and%20only%20needed%20for%20SDK%20follow-up%20calls.)

## What is inside

- `api/webhook.ts`: the Vercel Function
- `src/webhook.ts`: key check, JSON parsing, event validation, idempotency hook
- `sample-payloads/`: example One Horizon events
- `src/sdk.ts`: optional follow-up API calls

The endpoint accepts `HEAD`, `GET`, and JSON `POST` requests at `/webhook`.

## Run it locally

```bash
yarn install
cp .env.example .env
yarn dev
```

```bash
curl http://localhost:3000/webhook \
  -X POST \
  -H "content-type: application/json" \
  -H "x-one-webhook-key: paste-one-horizon-webhook-key-here" \
  -H "x-one-event-id: evt_task_created" \
  -H "x-one-event-type: task.created" \
  --data @sample-payloads/task-created.json
```

## Connect One Horizon

1. Deploy this repo to Vercel.
2. Add `ONE_WEBHOOK_KEY` in Vercel.
3. In One Horizon, open **Settings -> Apps**.
4. Add the deployed `/webhook` URL.
5. Pick events and click **Verify**.

## Before you ship

The in-memory event store is for the template. Replace it with Redis, Postgres, or another durable store before doing side effects. Keep the response fast; One Horizon waits 3 seconds before timing out.

## Checks

```bash
yarn typecheck
yarn test
yarn build
```
