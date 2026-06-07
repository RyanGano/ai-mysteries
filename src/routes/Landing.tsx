import { Link } from "react-router-dom";
import "../styles/landing.css";

export default function Landing() {
  return (
    <main className="landing">
      <div className="landing-cover">
        <img src="/cover.webp" alt="Within Tolerance book cover" className="cover-image" />
      </div>
      <div className="landing-content">
        <h1 className="landing-title">Within Tolerance</h1>
        <p className="landing-blurb">
          Michael Holloway, founder of Meridian Energy, is found dead inside the Charge Cage at the
          company&rsquo;s battery-storage facility. Detective Mara Ellery investigates. Five
          suspects. One system. No shortage of reasons.
        </p>
        <p className="landing-blurb">
          The book ends where it ends. But the truth has more than one shape.
        </p>
        <Link to="/therealending" className="cta-button">
          Already read the book? Find your ending &rarr;
        </Link>
        <p className="landing-secret">
          Most readers find an ending. They say there is a rarer one still &mdash; hidden so well
          that only the most relentless detectives ever turn it up.
        </p>
      </div>
    </main>
  );
}
