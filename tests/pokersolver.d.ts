declare module "pokersolver" {
  const solver: {
    Hand: {
      solve: (cards: string[]) => unknown;
      winners: (hands: unknown[]) => unknown[];
    };
  };
  export default solver;
}
