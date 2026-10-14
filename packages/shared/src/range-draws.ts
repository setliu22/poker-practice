/** Weighted marginal range mass with ordinary draws, not showdown equity. */
export type RangeDrawDensity = {
  percent: number;
  flushDraw: number;
  openEndedStraightDraw: number;
  both: number;
  note: string;
};
