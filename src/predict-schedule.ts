export function visiblePredictionTournament(tournament: unknown) {
  return String(tournament || '').trim().toLowerCase() !== 'iem beijing';
}
