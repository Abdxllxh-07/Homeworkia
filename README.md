nki# Homeworkia

Open-source homework helper — snap a problem photo, get step-by-step solutions, and ask questions about any step. No monetization, no memberships. Built for the love of the game.

## Stack

- Next.js (App Router)
- Tailwind CSS
- react-dropzone (desktop drop + mobile camera)
- Lucide icons
- KaTeX via `react-katex`

## Current status

Scaffold + responsive UI with **mock solve data** so layout can be verified before wiring OmniRoute / Gemini Vision.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Planned API

`POST /api/solve` — accepts `{ imageBase64 }` and will return:

```json
{
  "problemText": "...",
  "finalAnswer": "...",
  "steps": [
    {
      "stepNumber": 1,
      "title": "...",
      "explanation": "...",
      "mathFormula": "..."
    }
  ]
}
```

Right now the route returns mock data so the contract is in place.
