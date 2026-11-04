export type EventSubSignatureInput = {
 id: string;
 timestamp: string;
 signature: string;
 body: Buffer;
 secret: string;
 now?: number;
};
export declare function verifyEventSubMessage(input: EventSubSignatureInput): boolean;
