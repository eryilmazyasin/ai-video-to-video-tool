# AI Video-to-Video Transformation Tool

A full-stack case study that transforms a source video with Magic Hour AI. Users upload a video, choose transformation settings, and follow the result while it is processed in the background.

## Live demo

[https://ai-video-to-video-tool.vercel.app/](https://ai-video-to-video-tool.vercel.app/)

## What it does

- Uploads MP4 and MOV source videos with Uploadcare
- Validates video type and a 50 MB size limit
- Stores source and generated videos in Cloudinary
- Sends the selected settings to Magic Hour's video-to-video model
- Receives asynchronous Magic Hour updates through a signed webhook
- Saves each transformation and its status in MongoDB
- Shows project history, processing states, errors, source videos, and generated videos
- Works on desktop and mobile layouts

## Tech stack

- Next.js 16, React, TypeScript and Tailwind CSS
- MongoDB Atlas
- Uploadcare
- Cloudinary
- Magic Hour API
- Vercel

## How the flow works

1. The user uploads a video to Uploadcare from the browser.
2. `POST /api/upload` checks the file and copies it to Cloudinary.
3. A new transformation record is saved in MongoDB with the `ready` status.
4. The user chooses clip, style, frame rate, model, version, and prompt settings.
5. `POST /api/transform` creates a Magic Hour job and changes the record to `queued`.
6. Magic Hour calls `POST /api/webhook` as the job progresses.
7. When processing is complete, the generated video is copied to Cloudinary and MongoDB is updated.
8. The history view refreshes automatically while the page is open.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Validates an Uploadcare video and stores the source in Cloudinary. |
| `POST` | `/api/transform` | Sends the selected settings to Magic Hour. |
| `POST` | `/api/webhook` | Receives Magic Hour job events and saves the generated video. |
| `GET` | `/api/history` | Returns the current browser's transformation history. |

## Run locally

Requirements:

- Node.js 24+
- MongoDB Atlas account
- Cloudinary account
- Uploadcare project
- Magic Hour account with video-to-video credits

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

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add every variable from `.env.example` to Vercel Environment Variables.
3. Set `APP_URL` to the production URL.
4. Deploy the project.
5. Configure the Magic Hour webhook URL shown above.

## Error handling and security

- Only MP4 and MOV files up to 50 MB are accepted.
- The server checks Uploadcare file details again before storage.
- API keys and database credentials stay on the server.
- Webhook signatures are checked before processing provider events.
- Invalid API input and provider failures show safe user-facing error messages.
- Duplicate webhook events do not create duplicate generated videos.

## Notes

- This case study uses an anonymous browser cookie to keep each browser's history separate. It is not a full authentication system.
- Video transformations can consume Magic Hour credits. Short test clips are recommended during development.
