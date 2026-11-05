// Stable, streamer-scoped key for Twitch EventSub delivery deduplication.
// Reject missing IDs rather than accidentally deduplicating unrelated events.
export function chatDedupKey(broadcasterId, messageId) {
 if (typeof broadcasterId!=='string' || !/^[0-9]+$/.test(broadcasterId)) throw new Error('invalid_broadcaster_id');
 if (typeof messageId!=='string' || !messageId.trim() || messageId.length>256) throw new Error('invalid_message_id');
 return broadcasterId+':'+messageId;
}
export function isDuplicateInsertError(error) {
 return error?.code==='23505';
}
