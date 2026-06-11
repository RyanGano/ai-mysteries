import { Routes, Route } from "react-router-dom";
import Landing from "./routes/Landing";
import BookHome from "./routes/BookHome";
import FindEnding from "./routes/FindEnding";
import Ending from "./routes/Ending";
import Read from "./routes/Read";
import Privacy from "./routes/Privacy";
import Footer from "./components/Footer";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* /:bookId is the book's home (cover, summary, CTAs, code entry) */}
        <Route path="/:bookId" element={<BookHome />} />
        <Route path="/:bookId/ending" element={<FindEnding />} />
        <Route path="/:bookId/ending/:code" element={<Ending />} />
        <Route path="/:bookId/:slug" element={<Read />} />
      </Routes>
      <Footer />
    </>
  );
}
