import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4000;

// Express 5 hands listen errors (EADDRINUSE) to this callback instead of throwing.
createApp().listen(port, '0.0.0.0', (err) => {
  if (err) {
    console.error(`Could not listen on port ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`tap-to-pay-svc listening on http://0.0.0.0:${port}`);
});
