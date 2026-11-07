// Live loudness (0..1) of the assistant's voice and the caller's microphone, written by the call
// session into a ref so it never triggers a React render.
export type VoiceLevels = { agent: number; user: number };
