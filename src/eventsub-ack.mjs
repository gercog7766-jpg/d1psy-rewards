// Only the opt-in atomic multistream path may acknowledge after persistence.
export async function acknowledgeChat({atomicEnabled,route,sendStatus,onLegacyError}){
 if(atomicEnabled){
   try{await route();return sendStatus(204);}
   catch(error){console.error('Atomic EventSub processing failed',error);return sendStatus(500);}
 }
 sendStatus(204);
 void Promise.resolve().then(route).catch(onLegacyError);
}
