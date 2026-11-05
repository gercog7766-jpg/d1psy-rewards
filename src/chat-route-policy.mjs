// Pure Twitch broadcaster routing policy. No database, network, or secrets.
export function decideChatRoute({ multistreamDbEnabled, pocIsolation, primaryBroadcasterId, pocBroadcasterId, broadcasterId, resolvedStreamer }) {
  if (!broadcasterId) return 'ignored';
  if (multistreamDbEnabled) return resolvedStreamer ? 'streamer' : 'ignored';
  if (pocIsolation) return pocBroadcasterId && broadcasterId === pocBroadcasterId ? 'poc' : 'ignored';
  if (!primaryBroadcasterId) return 'ignored'; // Fail closed, never accept arbitrary broadcasters.
  return broadcasterId === primaryBroadcasterId ? 'primary' : 'ignored';
}
