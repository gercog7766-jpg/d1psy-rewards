// Confirmed PGL Stage 1 results from the HLTV results screenshot, 24 November.
// Scores are keyed by the same round and sorted team IDs as the Swiss bracket.
export const majorMatchResults: Record<number, Record<string, {winner:string; scores:Record<string,number>}>> = {
  1: {
    '0/heroic/imperial': {winner:'imperial',scores:{heroic:6,imperial:13}},
    '0/9z/lynn-vision': {winner:'lynn-vision',scores:{'9z':11,'lynn-vision':13}},
    '0/m80/nip': {winner:'nip',scores:{nip:13,m80:10}},
    '0/100t/chinggis': {winner:'100t',scores:{'100t':13,chinggis:6}},
    '0/bcgame/liquid': {winner:'liquid',scores:{liquid:13,bcgame:1}},
    '0/dendele/parivision': {winner:'parivision',scores:{parivision:13,dendele:3}},
  },
};
