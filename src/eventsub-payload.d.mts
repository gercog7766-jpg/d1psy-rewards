export type TwitchChatPayload = {
 subscription?: { type?: string; condition?: { broadcaster_user_id?: string } };
 event?: { broadcaster_user_id?: string; chatter_user_id?: string };
};
export declare function validChatNotification(payload: TwitchChatPayload | null | undefined): boolean;
