import { Link } from "react-router-dom";
import "../styles/footer.css";

// Site-wide footer. Generic, book-agnostic chrome: the AI-authorship notice, the standard
// fiction disclaimer, and a link to the privacy policy. Carries no book data.
export default function Footer() {
  return (
    <footer className="site-footer">
      <p className="site-footer-line">
        Every story on this site is written by AI. All characters and events are fictitious &mdash;
        any resemblance to real persons, living or dead, or to actual events is purely coincidental.
      </p>
      <p className="site-footer-links">
        <Link to="/privacy">Privacy</Link>
      </p>
    </footer>
  );
}
