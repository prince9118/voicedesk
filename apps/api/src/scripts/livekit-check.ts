// Verifies that LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env are accepted by
// LiveKit Cloud. Token signing works offline with any secret, so tests cannot prove this.
// Usage (from apps/api): npm run livekit:check
import { RoomServiceClient } from "livekit-server-sdk";
import { config } from "../config.js";

// The SDK converts wss:// to https:// for its server API calls.
const client = new RoomServiceClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);

try {
  const rooms = await client.listRooms();
  console.log(`OK: LiveKit accepted the credentials for ${config.LIVEKIT_URL}`);
  console.log(`Active rooms: ${rooms.length}`);
} catch (err) {
  // Print the reason, never the secret.
  console.error(`FAILED: ${config.LIVEKIT_URL} rejected the request.`);
  console.error(err instanceof Error ? err.message : String(err));
  console.error("Check the URL, key and secret under Settings -> API keys in the LiveKit Cloud dashboard.");
  process.exitCode = 1;
}
