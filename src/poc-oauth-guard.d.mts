export function pocOauthAllowed(input:{routesEnabled:boolean;isolation:boolean;multistreamDbEnabled:boolean;expectedLogin:string}):boolean;
export function matchesPocAccount(user:{id?:string;login?:string}|null|undefined,input:{expectedLogin:string;expectedBroadcasterId?:string}):boolean;
