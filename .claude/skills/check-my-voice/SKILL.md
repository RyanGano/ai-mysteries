---
name: check-my-voice
description: Score how closely a piece of writing matches Ryan's authorial voice and report a closeness %. Use when the user asks "is this in my voice?", "how close is this to my voice", "check my voice", "does this sound like me", "grade this against my style", or wants a draft critiqued/rated against the author's voice. Returns per-dimension scores, an overall %, quoted evidence, and concrete fixes.
---

# Check my voice

Read a passage and judge how much it sounds like **Ryan** — the warm, plain-spoken,
conversational, gently funny voice of his published books. Return a **closeness %**, the
evidence behind it, and the few changes that would raise it most.

## Procedure

1. **Load the voice profile.** Read
   [`../write-in-my-voice/voice-profile.md`](../write-in-my-voice/voice-profile.md). It defines
   the stance, diction, rhythm, signature moves, and the "off-voice" tells. Score against it,
   not against a vague memory.

2. **Identify the mode** the text is *trying* to be — **fiction** (third-person narrative) or
   **nonfiction/teaching** (direct address). Judge it against that mode's expectations from the
   profile's **Genre translation** section. (A mystery chapter should *not* be penalized for
   lacking second-person "you"; a devotional *should* be.) If unclear, state your assumption.

3. **Score the seven dimensions** (0–100 each). For each, give a one-line judgment **with a short
   quoted snippet** from the text as evidence (or note its absence):

   | # | Dimension | Weight | What earns a high score |
   |---|---|---|---|
   | 1 | **Diction & simplicity** | 20% | Plain everyday words, contractions, colloquial idioms; technical terms defined in plain language. Loses points for jargon, fancy vocabulary, no contractions. |
   | 2 | **Tone & stance** | 20% | Warm, humble, grace-first, self-deprecating, shoulder-to-shoulder. Loses points for preachiness, condescension, coldness, cynicism. |
   | 3 | **Rhythm** | 15% | Short-to-medium sentences with deliberate short punches and one-line emphasis; varied, speech-like cadence; short paragraphs. Loses points for uniform medium sentences and dense blocks. |
   | 4 | **Analogy & concreteness** | 15% | At least one everyday analogy *walked through*, mapping the idea onto a familiar scene. Loses points for staying abstract. |
   | 5 | **Reader connection** | 10% | *Nonfiction:* direct address + rhetorical-question clusters + confessional "I." *Fiction:* free-indirect warmth that pulls the reader in. An **occasional** warm narratorial aside with a casual "you" (e.g. "more than you'd think") is in-voice and approved — do **not** penalize it; only dock for *sustained* second-person teaching. |
   | 6 | **Humor & asides** | 10% | Gentle, often self-directed humor; the occasional light parenthetical wink. Loses points for humorlessness OR for trying-too-hard/snark. |
   | 7 | **Negative space** | 10% | *Absence* of off-voice tells: no purple prose, no unexplained jargon, no condescension, no generic-AI fingerprints (*delve, tapestry, testament to, navigate the complexities, it's important to note*, em-dash-stitched abstractions, tricolons everywhere). Full marks = clean; subtract for each tell present. |

4. **Compute the overall closeness %** = the weighted average of the seven scores. Round to a
   whole number. Map it to a band:

   - **90–100 — Unmistakably your voice.** Reads as if you wrote it.
   - **75–89 — Clearly your voice, minor drift.** A few lines to tune.
   - **60–74 — Leaning your way, generic in places.** The texture is partly there.
   - **40–59 — Off-voice.** Recognizable as not-you in tone, diction, or rhythm.
   - **Below 40 — Not your voice.** Different writer entirely.

5. **List the top 3 fixes** — the specific, highest-leverage edits that would raise the score
   most, each tied to a dimension and (where useful) a rewrite of one offending line into your
   voice. Concrete beats general: quote the weak line, show the fix.

## Output format

```
Mode judged: <fiction | nonfiction>   (assumption, if inferred)

Overall: NN%  — <band label>

  1. Diction & simplicity   NN/100 — <judgment> — "<evidence snippet>"
  2. Tone & stance          NN/100 — <judgment> — "<evidence snippet>"
  3. Rhythm                 NN/100 — <judgment> — "<evidence snippet>"
  4. Analogy & concreteness NN/100 — <judgment> — "<evidence snippet>"
  5. Reader connection      NN/100 — <judgment> — "<evidence snippet>"
  6. Humor & asides         NN/100 — <judgment> — "<evidence snippet>"
  7. Negative space         NN/100 — <judgment> — "<tell found, or 'clean'>"

Top fixes to raise the score:
  • <fix 1 — dimension — before → after>
  • <fix 2 — …>
  • <fix 3 — …>
```

Keep it tight. Lead with the headline % so it's the first thing the user sees.

## Notes

- **Be honest and calibrated, not generous.** A fluent, polished paragraph that happens to be
  generic should land in the 40–60s, not the 80s — politeness here just hides the drift. Reserve
  90+ for text that genuinely carries the diction, rhythm, *and* warmth together.
- One snippet of real evidence per dimension beats a paragraph of abstract praise.
- If the user also wants the text *fixed*, hand off to the **write-in-my-voice** skill (or apply
  your top fixes) — this skill's job is the diagnosis and the score.
