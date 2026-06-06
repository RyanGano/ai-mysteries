import vargaVariance from "./varga-variance.md?raw";
import samAllRooms from "./sam-all-rooms.md?raw";

export interface Ending {
  code: string;
  culprit: string;
  title: string;
  body: string;
}

export const endings: Ending[] = [
  {
    code: "7BXK",
    culprit: "Elias Varga",
    title: "Chapter 17 — The Real Ending",
    body: vargaVariance,
  },
  {
    code: "Q4NM",
    culprit: "SAM",
    title: "Chapter 17 — The Real Ending",
    body: samAllRooms,
  },
];
