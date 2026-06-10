import { Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";
import FindEnding from "./routes/FindEnding";
import Ending from "./routes/Ending";
import Read from "./routes/Read";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* No slug → Read fetches the table of contents and redirects to the first chapter. */}
      <Route path="/read" element={<Read />} />
      <Route path="/read/:slug" element={<Read />} />
      <Route path="/therealending" element={<FindEnding />} />
      <Route path="/therealending/:code" element={<Ending />} />
    </Routes>
  );
}
