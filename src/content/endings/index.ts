import vargaVariance from "./varga-variance.md?raw";
import samAllRooms from "./sam-all-rooms.md?raw";
import rourkeMaintenance from "./rourke-maintenance.md?raw";
import shahKnownRisk from "./shah-known-risk.md?raw";
import pikeSecondCheck from "./pike-second-check.md?raw";
import calderStopWork from "./calder-stop-work.md?raw";
import allDistributed from "./all-distributed.md?raw";

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
  {
    code: "P8WR",
    culprit: "Marcus Rourke",
    title: "Chapter 17 — The Real Ending",
    body: rourkeMaintenance,
  },
  {
    code: "H3TG",
    culprit: "Priya Shah",
    title: "Chapter 17 — The Real Ending",
    body: shahKnownRisk,
  },
  {
    code: "F6MZ",
    culprit: "Jonah Pike",
    title: "Chapter 17 — The Real Ending",
    body: pikeSecondCheck,
  },
  {
    code: "K9VC",
    culprit: "Renée Calder",
    title: "Chapter 17 — The Real Ending",
    body: calderStopWork,
  },
  {
    code: "B2XS",
    culprit: "All of the team",
    title: "Chapter 17 — The Real Ending",
    body: allDistributed,
  },
];
