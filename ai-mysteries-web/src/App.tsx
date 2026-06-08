import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./routes/Landing";
import FindEnding from "./routes/FindEnding";
import Ending from "./routes/Ending";
import Read from "./routes/Read";
import { firstChapterSlug } from "./lib/book";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/read" element={<Navigate to={`/read/${firstChapterSlug}`} replace />} />
      <Route path="/read/:slug" element={<Read />} />
      <Route path="/therealending" element={<FindEnding />} />
      <Route path="/therealending/:code" element={<Ending />} />
    </Routes>
  );
}
