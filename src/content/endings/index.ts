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
    code: "VRG7",
    culprit: "Elias Varga",
    title: "Variance",
    body: vargaVariance,
  },
  {
    code: "SAM4",
    culprit: "SAM",
    title: "All Rooms",
    body: samAllRooms,
  },
];
