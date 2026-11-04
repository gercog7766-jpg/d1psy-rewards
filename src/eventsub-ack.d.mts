export function acknowledgeChat(args:{
 atomicEnabled:boolean;
 route:()=>Promise<void>;
 sendStatus:(status:number)=>unknown;
 onLegacyError:(error:unknown)=>void|Promise<void>;
}):Promise<unknown>;
