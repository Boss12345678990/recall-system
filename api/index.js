// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// The built client in client/dist is served by Vercel's static hosting, not Express.
import { createApp } from '../server/src/app.js'

export default createApp({ clientDist: null })
