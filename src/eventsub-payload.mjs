// Validates that a signed Twitch chat notification matches its subscription.
export function validChatNotification(payload) {
 const broadcaster=payload?.event?.broadcaster_user_id;
 const subscribed=payload?.subscription?.condition?.broadcaster_user_id;
 return payload?.subscription?.type==='channel.chat.message'
   && typeof broadcaster==='string' && broadcaster.length>0
   && typeof subscribed==='string' && subscribed.length>0
   && broadcaster===subscribed
   && typeof payload?.event?.chatter_user_id==='string'
   && payload.event.chatter_user_id.length>0;
}
