// Archive only the completed IEM tournament; retain records and existing claim RPCs.
export const iemArchiveAt=Date.parse('2026-11-08T23:59:00+03:00');
export function visiblePredictionTournament(tournament:unknown,at=Date.now()){
 return at<iemArchiveAt||String(tournament||'').trim().toLowerCase()!=='iem beijing';
}
