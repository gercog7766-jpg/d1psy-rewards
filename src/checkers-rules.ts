export type Side = 'w' | 'b';
type Piece = '' | 'w' | 'W' | 'b' | 'B';
export type Position = {
  board: Piece[];
  turn: Side;
  forced: number | null;
  captured: number[];
  history: string[];
  quiet: number;
};
export const opposite = (side: Side): Side => side === 'w' ? 'b' : 'w';

function positionKey(board: Piece[], turn: Side) {
  return turn + board.map(piece => piece || '.').join('');
}

export function initialCheckers(): Position {
  const board = Array.from<Piece>({length: 64}).fill('');
  for (let i = 0; i < 64; i++) {
    const row = Math.floor(i / 8);
    if ((row + i % 8) % 2) board[i] = row < 3 ? 'b' : row >= 5 ? 'w' : '';
  }
  return {board, turn:'w', forced:null, captured:[], history:[positionKey(board,'w')], quiet:0};
}

const diagonals = [[1,1],[1,-1],[-1,1],[-1,-1]];
function square(row: number, col: number) {
  return row >= 0 && row < 8 && col >= 0 && col < 8 ? row * 8 + col : -1;
}

function captures(position: Position, from: number) {
  const {board, captured} = position;
  const piece = board[from];
  const row = Math.floor(from / 8), col = from % 8;
  const result = new Map<number, number>();
  for (const [dr, dc] of diagonals) {
    let enemy = -1;
    for (let distance = 1; distance < 8; distance++) {
      const at = square(row + dr * distance, col + dc * distance);
      if (at < 0) break;
      if (board[at]) {
        if (enemy >= 0 || board[at].toLowerCase() === piece.toLowerCase() || captured.includes(at)) break;
        enemy = at;
      } else if (enemy >= 0) {
        result.set(at, enemy);
      }
      if (piece === piece.toLowerCase() && (distance === 2 || enemy < 0)) break;
    }
  }
  return result;
}

function quietMove(board: Piece[], from: number, to: number) {
  if (board[to] || from === to) return false;
  const dr = Math.floor(to / 8) - Math.floor(from / 8), dc = to % 8 - from % 8;
  if (Math.abs(dr) !== Math.abs(dc)) return false;
  const piece = board[from];
  if (piece === piece.toLowerCase()) return dr === (piece === 'w' ? -1 : 1);
  const delta = Math.sign(dr) * 8 + Math.sign(dc);
  for (let i = from + delta; i !== to; i += delta) if (board[i]) return false;
  return true;
}

export function moveCheckers(position: Position, from: number, to: number) {
  const {turn} = position;
  if (![from,to].every(i => Number.isInteger(i) && i >= 0 && i < 64)) return null;
  const piece = position.board[from];
  if (piece.toLowerCase() !== turn || (position.forced !== null && position.forced !== from)) return null;
  const enemy = captures(position, from).get(to);
  if (enemy === undefined && (
    position.forced !== null ||
    !quietMove(position.board,from,to) ||
    position.board.some((p,i) => p.toLowerCase() === turn && captures(position,i).size > 0)
  )) return null;

  const board = position.board.slice();
  const promoted = (piece === 'w' && to < 8) || (piece === 'b' && to >= 56);
  board[from] = '';
  board[to] = promoted ? piece.toUpperCase() as Piece : piece;
  const captured = enemy === undefined ? [] : [...position.captured,enemy];
  if (enemy !== undefined && captures({...position,board,captured},to).size) {
    return {position:{...position,board,captured,forced:to}, winner:null, draw:false};
  }

  for (const cell of captured) board[cell] = '';
  const next = opposite(turn);
  const key = positionKey(board,next);
  const irreversible = captured.length > 0 || piece === piece.toLowerCase();
  const history = irreversible ? [key] : [...position.history,key];
  const quiet = irreversible ? 0 : position.quiet + 1;
  const after: Position = {board,turn:next,forced:null,captured:[],history,quiet};
  const canMove = board.some((p,i) => p.toLowerCase() === next &&
    (captures(after,i).size > 0 || board.some((_,j) => quietMove(board,i,j))));
  return {position:after,winner:canMove ? null : turn,
    draw:canMove && (quiet >= 30 || history.filter(value => value === key).length >= 3)};
}
