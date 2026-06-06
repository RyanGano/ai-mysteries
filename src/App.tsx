import { Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";
import FindEnding from "./routes/FindEnding";
import Ending from "./routes/Ending";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/therealending" element={<FindEnding />} />
      <Route path="/therealending/:code" element={<Ending />} />
    </Routes>
  );
}
