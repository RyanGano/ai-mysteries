import { useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/privacy.css";

// Static, book-agnostic privacy policy. The site collects nothing, so this is plain chrome —
// no API call, no book data.
export default function Privacy() {
  useEffect(() => {
    document.title = "AI Mysteries — Privacy";
  }, []);

  return (
    <main className="privacy">
      <div className="privacy-bar">
        <Link to="/" className="privacy-back">
          &larr; AI Mysteries
        </Link>
      </div>
      <article className="privacy-body">
        <h1 className="privacy-title">Privacy Policy</h1>

        <p>
          The short version:{" "}
          <strong>
            we don&rsquo;t collect, store, or use any personal or aggregated data about you.
          </strong>
        </p>

        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>No accounts, sign-ins, or profiles.</li>
          <li>No analytics, tracking pixels, or advertising.</li>
          <li>
            No selling, sharing, or monetizing of data &mdash; because we don&rsquo;t collect any.
          </li>
          <li>We don&rsquo;t record or report which ending you landed on.</li>
        </ul>

        <h2>What happens when you use the site</h2>
        <p>
          When you open a story or enter an ending code, your browser asks our server for that
          content, and the server sends it back. We don&rsquo;t log who you are, build a profile, or
          connect your requests to you. Like any website, our hosting provider may process basic
          technical request data (such as IP address) to deliver pages and keep the service running;
          we don&rsquo;t use it to identify or track you.
        </p>

        <h2>Changes</h2>
        <p>If this policy ever changes, the updated version will appear on this page.</p>
      </article>
    </main>
  );
}
