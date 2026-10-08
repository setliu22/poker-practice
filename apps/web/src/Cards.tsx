const suitInfo: Record<string, { symbol: string; name: string }> = {
  c: { symbol: "♣", name: "clubs" },
  d: { symbol: "♦", name: "diamonds" },
  h: { symbol: "♥", name: "hearts" },
  s: { symbol: "♠", name: "spades" },
};
const rankNames: Record<string, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "10",
};
export function Cards({
  cards,
  small = false,
  highlighted = [],
}: {
  cards: string[];
  small?: boolean;
  highlighted?: string[];
}) {
  return (
    <div className={`cards ${small ? "small" : ""}`}>
      {cards.map((c) => (
        <span
          className={`card suit-${c[1]} ${highlighted.includes(c) ? "decisive" : ""}`}
          key={c}
          aria-label={`${rankNames[c[0]] ?? c[0]} of ${suitInfo[c[1]].name}${highlighted.includes(c) ? ", deciding rank" : ""}`}
          role="img"
        >
          <span>{c[0] === "T" ? "10" : c[0]}</span>
          <span>{suitInfo[c[1]].symbol}</span>
        </span>
      ))}
    </div>
  );
}
