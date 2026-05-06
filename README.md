# One Horizon webhooks on Vercel

Vercel version of the One Horizon webhook starter. One function, the webhook code, and nothing from the other hosts.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/onehorizonai/webhook-template-vercel&env=ONE_WEBHOOK_KEY,ONE_API_KEY&envDescription=Paste%20ONE_WEBHOOK_KEY%20from%20your%20One%20Horizon%20webhook%20settings.%20ONE_API_KEY%20is%20optional%20and%20only%20needed%20for%20SDK%20follow-up%20calls.)

## Files to look at

- `api/webhook.ts`: the Vercel Function
- `src/webhook.ts`: key check, CloudEvents JSON parsing, event validation, idempotency
- `sample-payloads/`: example One Horizon events
- `src/sdk.ts`: optional API calls after receiving an event

Vercel rewrites `/webhook` to `api/webhook.ts`. The function accepts `HEAD`, `GET`, and CloudEvents JSON `POST`.

The small `public/index.html` page is intentional. Vercel expects an output directory for this project shape after the build completes, so `vercel.json` pins `outputDirectory` to `public`.

## One Horizon links

- [One Horizon](https://onehorizon.ai)
- [Webhook docs](https://onehorizon.ai/docs/integrations/webhooks)
- [REST API docs](https://onehorizon.ai/docs/reference)
- [JavaScript SDK](https://www.npmjs.com/package/@onehorizon/sdk-js)

```bash
npm i @onehorizon/sdk-js
```

## Run it locally

```bash
yarn install
cp .env.example .env
yarn dev
```

```bash
curl http://localhost:3000/webhook \
  -X POST \
  -H "content-type: application/cloudevents+json; charset=utf-8" \
  -H "x-one-webhook-key: paste-one-horizon-webhook-key-here" \
  -H "x-one-event-id: evt_task_created" \
  -H "x-one-event-type: task.created" \
  --data @sample-payloads/task-created.json
```

## Connect it to One Horizon

1. Deploy this repo to Vercel.
2. Set `ONE_WEBHOOK_KEY` in Vercel.
3. In One Horizon, open **Settings -> Apps**.
4. Add the deployed `/webhook` URL.
5. Pick the events you want.
6. Click **Verify**.

## Replace before real use

The event store is just memory. Before this does anything real, save processed event IDs in Redis, Postgres, or another durable store. Keep the handler quick; One Horizon times out after 3 seconds.

## Checks

```bash
yarn typecheck
yarn test
yarn build
```
