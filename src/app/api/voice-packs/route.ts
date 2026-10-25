import {
  voicePacks,
  createVoicePackHandlers,
} from "../../../lib/server/voice-packs";

export const runtime = "nodejs";
export const { GET, POST } = createVoicePackHandlers(voicePacks);
