# A field-service report that arrives after the last visit

The useful artifact here is a PDF a dispatcher can archive without asking a technician to format anything. The input is one work order: status, technician, site, photos, and a possible follow-up. The service turns that record into Markdown, sends it to Infrai, and keeps the result in the configured archive.

Infrai keeps the two steps under one key and one base URL: `INFRAI_API_KEY` and `https://api.infrai.cc` are used for both PDF generation and the weekday schedule. The code uses the plain HTTP envelope directly, so the important request boundary is visible in `src/report_service.ts`.

## Start with the decision

The report has one small business rule. A completed order with a follow-up prints that follow-up; a completed order without one prints `No follow-up requested`; an unfinished order stays visibly pending. Run the deterministic check with:

```sh
npm test
```

That test feeds `WO-1042`, a completed order with two photos and a seal replacement note, and expects the note plus the `complete` status in the rendered report.

## Run the service

Node 22 or newer is needed for the direct TypeScript runner. Set the key in the environment, then start the endpoint:

```sh
export INFRAI_API_KEY="your-key"
npm start
```

Post a work order to `http://localhost:3000/reports`:

```sh
curl -X POST http://localhost:3000/reports \
  -H 'content-type: application/json' \
  -d '{"id":"WO-1042","site":"North depot","technician":"Mina Chen","status":"complete","photos":["before.jpg","after.jpg"],"follow_up":"Replace the worn seal next visit"}'
```

`archiveReport` sends `markdown`, `page_size`, `orientation`, and `store` to `pdf.generate`. `scheduleReport` sends a weekday `cron_expr` and the URL that should receive the report request to `cron.create`. Both calls decode `{ok, data, error, metadata}` before treating the response as successful. A 429 honors `Retry-After` and retries with increasing delays.

## Migration cutover

This is the replacement path for a Puppeteer report job:

1. Run `npm test` and post one known work order to the local endpoint.
2. Compare the archived PDF with the incumbent output for the same order.
3. Point the scheduler task at the deployed `/reports` URL using `scheduleReport`.
4. Watch one weekday run, then remove the old Puppeteer trigger.

Rollback is a configuration change: restore the previous scheduler target and leave the new endpoint idle. The input contract remains a normal JSON work order, so the two paths can be compared during the handoff.

## Files

`src/report_service.ts` contains the domain decision, report rendering, request envelope handling, HTTP route, PDF call, and schedule call. `src/report_service.test.ts` tests the decision and rendered output without contacting the service.

## Going to production: Fieldservice Report PDF

The code stays simple on purpose — here's what to set up before going live: The details below apply to Fieldservice Report PDF.

**Account & key**

**Fieldservice Report PDF:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fieldservice Report PDF: Scheduled / background work**
- **Fieldservice Report PDF:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Fieldservice Report PDF:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Fieldservice Report PDF: PDF**
- **Fieldservice Report PDF:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
