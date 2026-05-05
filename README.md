# One Horizon webhook template for Vercel

Use this repo if you want a One Horizon webhook receiver on Vercel. No Netlify, Heroku, or Cloudflare files.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/onehorizonai/webhook-template-vercel&env=ONE_WEBHOOK_KEY,ONE_API_KEY&envDescription=Paste%20ONE_WEBHOOK_KEY%20from%20your%20One%20Horizon%20webhook%20settings.%20ONE_API_KEY%20is%20optional%20and%20only%20needed%20for%20SDK%20follow-up%20calls.)

## Included

- Vercel Function at `api/webhook.ts`
- `/webhook` endpoint
- webhook key checks
- JSON validation with a 256 KB limit
- retry-safe event ID handling
- Sample payloads
- optional SDK helper in `src/sdk.ts`

## Run locally

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

## Configure One Horizon

1. Add your deployed `/webhook` URL in **Settings -> Apps**.
2. Set `ONE_WEBHOOK_KEY` in Vercel.
3. Choose events.
4. Click **Verify**.

## Before production

- Keep `ONE_WEBHOOK_KEY` secret.
- Return `2xx` quickly.
- Store event IDs in Redis, Postgres, or another durable store before doing side effects.
- Queue slow work. One Horizon delivery requests time out after 3 seconds.

## Checks

```bash
yarn typecheck
yarn test
yarn build
```
