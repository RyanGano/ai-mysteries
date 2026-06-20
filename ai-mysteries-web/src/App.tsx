import { Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";
import BookLanding from "./routes/BookLanding";
import FindEnding from "./routes/FindEnding";
import Ending from "./routes/Ending";
import Read from "./routes/Read";
import Privacy from "./routes/Privacy";
import Footer from "./components/Footer";
import { ReadAloudProvider } from "./lib/read-aloud-context";

export default function App() {
  return (
    <ReadAloudProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* /:bookId is the book's landing page — the share target (cover + blurb). The catalog
            card deep-links past it straight into the first chapter. */}
        <Route path="/:bookId" element={<BookLanding />} />
        <Route path="/:bookId/ending" element={<FindEnding />} />
        <Route path="/:bookId/ending/:code" element={<Ending />} />
        <Route path="/:bookId/:slug" element={<Read />} />
      </Routes>
      <Footer />
    </ReadAloudProvider>
  );
}
