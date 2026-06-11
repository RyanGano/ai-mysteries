import { Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";
import FindEnding from "./routes/FindEnding";
import Ending from "./routes/Ending";
import Read from "./routes/Read";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* /:bookId with no slug → Read redirects to the first chapter */}
      <Route path="/:bookId" element={<Read />} />
      <Route path="/:bookId/ending" element={<FindEnding />} />
      <Route path="/:bookId/ending/:code" element={<Ending />} />
      <Route path="/:bookId/:slug" element={<Read />} />
    </Routes>
  );
}
