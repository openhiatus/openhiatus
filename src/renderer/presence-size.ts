/** Leave room for status, speech controls and their labels inside the actual conversation stage. */
export function presenceDiameter(width: number, height: number): number {
  return Math.round(Math.max(64, Math.min(240, width * 0.32, height * 0.32)));
}
