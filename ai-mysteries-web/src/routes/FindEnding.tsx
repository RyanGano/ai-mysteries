import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { pickWeightedRandomCode } from "../lib/endings";
import "../styles/find-ending.css";

// /therealending always resolves straight to a weighted-random ending.
// Entering a specific code lives on the landing page (/).
export default function FindEnding() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = pickWeightedRandomCode();
    navigate(`/therealending/${code}`, { replace: true });
  }, [navigate]);

  return (
    <main className="find-ending">
      <p className="find-ending-message">Revealing your ending&hellip;</p>
    </main>
  );
}
