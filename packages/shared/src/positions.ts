/** Position names follow the button; seat numbers stay fixed on screen. */
export function positionName(seat: number, dealer: number, players: number) {
  if (
    !Number.isInteger(players) ||
    players < 2 ||
    players > 9 ||
    !Number.isInteger(seat) ||
    seat < 0 ||
    seat >= players ||
    !Number.isInteger(dealer) ||
    dealer < 0 ||
    dealer >= players
  )
    throw new Error("Use a valid seat, button and table size.");
  const offset = (seat - dealer + players) % players;
  if (players === 2) return offset === 0 ? "Button · Small blind" : "Big blind";
  if (offset === 0) return "Button";
  if (offset === 1) return "Small blind";
  if (offset === 2) return "Big blind";
  if (offset === players - 1) return "Cutoff";
  if (offset === players - 2) return "Hijack";
  if (offset === players - 3) return "Lojack";
  return offset === 3 ? "Under the gun" : `Under the gun + ${offset - 3}`;
}
