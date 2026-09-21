# AI Video-to-Video Transformation Tool

A full-stack case-study application that uploads a source video, applies a Magic Hour video-to-video transformation, and tracks the asynchronous result. The project is built with Next.js and TypeScript and uses Uploadcare for direct browser uploads, Cloudinary for permanent video storage, and MongoDB for transformation history.

## Live demo

> Deployment pending — replace this line with the Vercel URL after deployment.

## Features

- Direct video upload from the browser to Uploadcare, with upload progress and clear error states
- Server-side verification of Uploadcare files before they are trusted
- MP4 and MOV validation with a 50 MiB file-size limit
- Permanent source and generated-video storage in Cloudinary
- Magic Hour video-to-video options for clip range, frame-rate resolution, art style, model, prompt behavior, prompt, and version
- Asynchronous job updates through a signed Magic Hour webhook
- Owner-scoped transformation history with automatic refresh while the page is open
- Responsive UI with source previews, generated-video previews, processing states, and safe error messages

## Tech stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS 4
- MongoDB Atlas and the official MongoDB Node.js driver
- Uploadcare React Uploader and REST client
- Cloudinary Node.js SDK
- Magic Hour Node.js SDK
- Zod for request and event validation
- Vercel for deployment

## How the workflow works

1. The browser uploads the selected video directly to Uploadcare. The Uploadcare secret key never reaches the browser.
2. The browser sends the returned Uploadcare UUID to `POST /api/upload`.
3. The server uses authenticated Uploadcare REST access to verify that the file exists, is ready, has an allowed MIME type, and is no larger than 50 MiB.
4. The server copies the verified source video to Cloudinary and creates a MongoDB transformation record with the `ready` status.
5. The user selects the transformation settings. `POST /api/transform` validates them, atomically claims the record, and submits the Cloudinary URL to Magic Hour.
6. Magic Hour processes the job asynchronously and sends account-level events to `POST /api/webhook`.
7. A valid `video.completed` event contains a temporary output URL. The webhook copies that video to Cloudinary and updates the MongoDB record to `completed`.
8. The history view requests `GET /api/history` every 4.5 seconds, so processing and completion changes appear without reloading the page.

Magic Hour currently accepts a public, extension-bearing HTTPS URL as `assets.videoFilePath`. The application therefore submits the permanent Cloudinary source URL directly instead of uploading the same file to another temporary input store. See the [Magic Hour input and output documentation](https://docs.magichour.ai/integration/inputs-and-outputs).

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Accepts an Uploadcare UUID, verifies the file, copies it to Cloudinary, and creates a `ready` MongoDB record. |
| `POST` | `/api/transform` | Validates the transformation ID and settings, then creates the Magic Hour job. Returns `202 Accepted` when queued. |
| `POST` | `/api/webhook` | Verifies and processes Magic Hour `video.started`, `video.completed`, and `video.errored` events. |
| `GET` | `/api/history` | Returns the latest 12 transformations owned by the current anonymous browser. |

All provider and database errors are converted to safe client-facing messages. Raw provider responses, signed URLs, and credentials are not returned to the browser.

## Transformation status lifecycle

The MongoDB `transformations` collection uses these states:

```text
ready -> submitting -> queued -> processing -> saving_output -> completed
                  \-> failed      \-> failed        \-> failed
```

- `ready`: the source is verified, stored in Cloudinary, and can be submitted.
- `submitting`: the record has been atomically claimed to prevent duplicate Magic Hour jobs.
- `queued`: Magic Hour accepted the request and returned a provider job ID.
- `processing`: Magic Hour sent a `video.started` event.
- `saving_output`: one webhook delivery owns the output copy operation.
- `completed`: the generated video is stored in Cloudinary and available in history.
- `failed`: submission, provider processing, or output storage failed.

`staging` remains part of the shared status model for future multi-step upload flows, but the current upload endpoint creates the record only after storage succeeds, so new records begin at `ready`.

## Requirements and validation

- Source format: MP4 (`video/mp4`) or MOV (`video/quicktime`)
- Maximum source size: 50 MiB (`50 * 1024 * 1024` bytes)
- Selected clip duration: greater than 0 seconds and no longer than 15 seconds
- Clip timestamps: from 0 to 3,600 seconds, with the end after the start
- Optional transformation name: up to 100 characters
- Custom prompt: up to 1,000 characters and required for `custom` or `append_default` prompt modes

The browser applies early file filters for a better experience, but the server repeats the important format and size checks using Uploadcare's verified file information.

## Anonymous ownership

The project does not include user accounts. Each browser receives a random owner ID in an `ai_video_owner` cookie after its first successful upload. The cookie is:

- `httpOnly`
- `SameSite=Lax`
- `Secure` in production
- valid for 30 days

MongoDB queries always include this owner ID, which keeps one anonymous browser from reading or submitting another browser's records. This is lightweight history separation, not authentication; clearing cookies creates a new identity and makes the previous browser history inaccessible.

## Prerequisites

- Node.js 24.x
- npm
- A MongoDB Atlas cluster
- A Cloudinary account
- An Uploadcare project
- A Magic Hour account with API access and enough credits for a real transformation

## Environment variables

Copy the example file and fill in your own values:

```bash
cp .env.example .env.local
```

| Variable | Where to get it | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection screen | Server-side database connection string. |
| `MONGODB_DB_NAME` | Your chosen MongoDB database name | Database containing the `transformations` collection, for example `ai-video`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard | Identifies the Cloudinary account. |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard | Authenticates server-side uploads. |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard | Secret used for server-side uploads; never expose it to the browser. |
| `NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY` | Uploadcare project API keys | Public key used by the browser uploader. This value is intentionally public. |
| `UPLOADCARE_SECRET_KEY` | Uploadcare project API keys | Authenticates the server when it verifies uploaded files. |
| `MAGIC_HOUR_API_KEY` | Magic Hour developer dashboard | Creates video-to-video jobs. |
| `MAGIC_HOUR_WEBHOOK_SECRET` | Magic Hour webhook settings | Verifies webhook signatures. |
| `APP_URL` | Your application URL | Canonical base URL used when configuring the webhook, such as `http://localhost:3000` locally or the production Vercel URL. |

Never commit `.env.local`. Environment values are read lazily, so a route only requires the credentials for the services it uses.

### Provider setup

1. **MongoDB Atlas:** create a database user, allow access from the required network addresses, copy the driver connection string into `MONGODB_URI`, and set `MONGODB_DB_NAME`. The application creates the `transformations` collection and its indexes when it is first used.
2. **Cloudinary:** copy the cloud name, API key, and API secret from the dashboard. Source videos are stored under `ai-video-to-video/sources`; generated videos are stored under `ai-video-to-video/outputs`.
3. **Uploadcare:** copy the public and secret keys from the project's API keys page. Enabling automatic file storage is recommended so an upload remains available while the server copies it to Cloudinary.
4. **Magic Hour:** create an API key, then configure the account-level webhook as described below. Keep the API key and webhook secret server-side.

## Magic Hour webhook setup

Magic Hour webhooks are configured at account level rather than passed with each transformation request.

1. Deploy the application or expose the local server through a trusted public HTTPS tunnel.
2. In the Magic Hour developer dashboard, set the webhook URL to:

   ```text
   https://your-domain.example/api/webhook
   ```

3. Copy the webhook signing secret to `MAGIC_HOUR_WEBHOOK_SECRET`.
4. Set `APP_URL` to the same public application origin and restart or redeploy the application after changing environment variables.

`localhost` cannot receive webhook calls from Magic Hour. Local end-to-end webhook testing therefore requires a public HTTPS tunnel or a deployed preview. `APP_URL` records the canonical public origin for setup; webhook registration itself is currently performed manually in the Magic Hour dashboard.

## Webhook security and retries

The webhook reads the untouched request body and calculates an HMAC-SHA256 signature over:

```text
${timestamp}.${rawBody}
```

It compares the expected and received hexadecimal signatures with a timing-safe comparison. Requests are rejected when the signature is malformed, the timestamp differs from the server time by more than five minutes, the event body is invalid, or the body is larger than 1 MB.

Completed events are handled idempotently:

- MongoDB atomically grants one delivery the `saving_output` state.
- Repeated or out-of-order events cannot move a completed record backwards.
- The Cloudinary output ID is based on the Magic Hour job ID, so retries replace the same asset instead of creating duplicates.
- An output-copy failure returns a non-2xx response and records a retryable failure.
- A retryable failure, or a `saving_output` lease older than five minutes, can be claimed by a later delivery.
- Events for unknown jobs and already handled deliveries are safely acknowledged and ignored.

## Local development

Install dependencies:

```bash
npm install
```

Create and complete the local environment file:

```bash
cp .env.example .env.local
```

Start the development server:

```bash
npm run dev
```

The application is available at [http://localhost:3000](http://localhost:3000).

## Checks

Run the configured ESLint rules:

```bash
npm run lint
```

Run a TypeScript check without emitting files:

```bash
npx tsc --noEmit
```

Create a production build:

```bash
npm run build
```

There is currently no automated test suite. Provider integration and browser-flow verification are manual checks in this MVP.

## Deploying to Vercel

1. Push the repository to GitHub and import it into Vercel.
2. Add every variable from `.env.example` to the Vercel project environment settings.
3. Set `APP_URL` to the final production origin, for example `https://your-project.vercel.app`.
4. Confirm that MongoDB Atlas network access permits connections from the deployment environment.
5. Deploy the application.
6. Configure the Magic Hour account-level webhook as `https://your-production-domain/api/webhook` and make sure its signing secret matches `MAGIC_HOUR_WEBHOOK_SECRET` in Vercel.
7. Redeploy after changing environment variables, then verify one short, low-cost transformation end to end.
8. Replace the placeholder in the **Live demo** section with the deployed URL.

Do not use a temporary Vercel preview URL as the long-term account-level webhook unless you plan to update it after every preview deployment.

## Error handling and security

- Provider secrets and MongoDB credentials are used only in server modules.
- Uploaded files are verified through authenticated Uploadcare file information before Cloudinary accepts them.
- All stored source and output URLs must use HTTPS.
- Zod rejects unknown request fields, invalid enum values, invalid clip ranges, and malformed webhook events.
- An atomic `ready` to `submitting` update prevents double clicks from creating duplicate paid jobs.
- Provider error details are replaced with fixed safe messages before storage or client responses.
- MongoDB indexes support owner-scoped history and enforce unique Magic Hour job IDs.
- The application ignores unsupported webhook event types without treating them as failures.

## Credit safety

Calling `POST /api/transform` creates a real Magic Hour job and can spend API credits. The 15-second clip limit keeps case-study usage more predictable, but it does not make transformations free. During development, use a short test clip, review the selected start/end values, and avoid repeatedly submitting the same source.

## Known MVP tradeoffs

- The completed webhook copies the generated video to Cloudinary inline. This makes retry behavior straightforward, but a large output can approach serverless execution limits. A production version should acknowledge the webhook quickly and move the copy to a durable queue or background worker.
- Anonymous cookie ownership is suitable for a case-study demo, not a multi-device product. Production history should use authenticated users and authorization checks.
- Upload preparation can leave an orphaned Cloudinary source if MongoDB insertion fails after the copy. A scheduled cleanup or transactional outbox would address this at scale.
- History uses 4.5-second polling rather than WebSockets or Server-Sent Events.
- `APP_URL` is currently a documented canonical origin and is not used to register the Magic Hour webhook automatically; account-level webhook configuration remains a manual deployment step.
