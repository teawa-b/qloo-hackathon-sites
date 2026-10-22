// Vercel entry: every request goes to the same app the local server runs (see vercel.json). SITE picks the app.
import { createApp } from '../server.js';

const app = createApp();
export default (req, res) => app(req, res);
