# AI Image-to-Image Transformation Tool

A full-stack case study that transforms one source image with Magic Hour AI. Users upload an image, choose generation settings, and follow the result while it is processed in the background.

## Live demo

[https://ai-video-to-video-tool.vercel.app/](https://ai-video-to-video-tool.vercel.app/)

## What it does

- Uploads one JPEG, PNG or WebP source image with Uploadcare
- Validates image type and a 20 MB size limit
- Stores source and generated images in Cloudinary
- Sends the selected prompt and image settings to Magic Hour's image editor
- Receives asynchronous Magic Hour image updates through a signed webhook
- Reconciles active image jobs with Magic Hour when history refreshes, so a missed webhook can recover safely
- Saves each transformation and its status in MongoDB
- Shows project history, processing states, errors, source images, and generated images
- Works on desktop and mobile layouts

## Tech stack

- Next.js 16, React, TypeScript and Tailwind CSS
- MongoDB Atlas
- Uploadcare
- Cloudinary
- Magic Hour API
- Vercel

## How the flow works

1. The user uploads one image to Uploadcare from the browser.
2. `POST /api/upload` checks the file and copies it to Cloudinary.
3. A new transformation record is saved in MongoDB with the `ready` status.
4. The user chooses a model, resolution, aspect ratio, result count and edit prompt.
5. `POST /api/transform` creates a Magic Hour job and changes the record to `queued`.
6. Magic Hour calls `POST /api/webhook` as the job progresses.
7. When processing is complete, the generated image or images are copied to Cloudinary and MongoDB is updated.
8. `GET /api/history` reconciles active jobs with Magic Hour before returning history. This recovers completed results if a webhook delivery was missed.
9. The history view refreshes automatically while the page is open.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Validates an Uploadcare image and stores the source in Cloudinary. |
| `POST` | `/api/transform` | Sends the selected settings to Magic Hour. |
| `POST` | `/api/webhook` | Receives Magic Hour image events and saves generated images. |
| `GET` | `/api/history` | Reconciles active Magic Hour jobs, then returns the current browser's transformation history. |

## Run locally

Requirements:

- Node.js 24+
- MongoDB Atlas account
- Cloudinary account
- Uploadcare project
- Magic Hour account with image editor credits

Install dependencies and create your local environment file:

```bash
npm install
cp .env.example .env.local
```

Add these values to `.env.local`:

| Variable | Used for |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | MongoDB database name |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY` | Browser upload key |
| `UPLOADCARE_SECRET_KEY` | Server-side Uploadcare verification |
| `MAGIC_HOUR_API_KEY` | Magic Hour API access |
| `MAGIC_HOUR_WEBHOOK_SECRET` | Magic Hour webhook signature verification |
| `APP_URL` | Application URL, for example `http://localhost:3000` |

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Webhook setup

Magic Hour webhooks need a public HTTPS URL, so `localhost` cannot receive them directly.

For the deployed app, set this URL in the Magic Hour dashboard:

```text
https://ai-video-to-video-tool.vercel.app/api/webhook
```

Copy the webhook signing secret from Magic Hour into `MAGIC_HOUR_WEBHOOK_SECRET` in Vercel. The endpoint verifies the signature before accepting an event.

The webhook endpoint must include the API route. Do not use only the deployment root URL:

```text
https://ai-video-to-video-tool.vercel.app/api/webhook
```

The signed webhook is the low-latency update path. The history endpoint also checks active image projects directly with Magic Hour, so a refresh can recover a completed result when a delivery is delayed or missed.

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add every variable from `.env.example` to Vercel Environment Variables.
3. Set `APP_URL` to the production URL.
4. Deploy the project.
5. Configure the Magic Hour webhook URL shown above.

## Error handling and security

- Only JPEG, PNG and WebP files up to 20 MB are accepted.
- The server checks Uploadcare file details again before storage.
- API keys and database credentials stay on the server.
- Webhook signatures are checked before processing provider events.
- Webhook and history reconciliation share an atomic output-save claim, so the same image result cannot be stored twice.
- Invalid API input and provider failures show safe user-facing error messages.
- Duplicate webhook events do not create duplicate generated images.

## Notes

- This case study uses an anonymous browser cookie to keep each browser's history separate. It is not a full authentication system.
- Image generations can consume Magic Hour credits. Use a single result while testing.
