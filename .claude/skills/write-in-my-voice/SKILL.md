---
name: write-in-my-voice
description: Write or rewrite text in Ryan's authorial voice — warm, plain-spoken, conversational, gently funny, self-deprecating. Use when the user says "write in my voice", "make this sound like me", "in Ryan's voice", "rewrite this in my style", or asks to draft prose/chapters/copy/endings that should match the author's style. Loads the voice profile distilled from Ryan's two published books and adapts it to fiction or nonfiction.
---

# Write in my voice

Produce text that sounds like **Ryan** wrote it: warm, humble, plain-spoken, conversational, and
gently funny — the voice of his two published youth-ministry books, adapted to whatever you're
writing now.

## Procedure

1. **Load the voice profile.** Read [`voice-profile.md`](voice-profile.md) in this folder. It is
   the source of truth — the stance, diction, rhythm, signature moves, and the "off-voice" tells
   to avoid. Don't write from memory of this skill alone; the profile has the detail.

2. **Pick the mode.** Decide which the task is and follow that half of the profile's
   **Genre translation** section:
   - **Fiction** (a mystery chapter/ending/blurb for this site, a story, any narrative prose) →
     keep the *texture*, drop the second-person teaching *frame*. Third-person narrator with
     Ryan's plain warmth and timing; no "you," no scripture, no "let me explain."
   - **Nonfiction / teaching** (a devotional, blog post, talk, direct-address piece) → use the
     full kit: second-person address, rhetorical-question clusters, confessional "I," everyday
     analogies, encouraging close.
   - If genuinely ambiguous, default to **fiction** when working inside this repo's book content;
     otherwise ask one quick question.

3. **Write it, hitting the voice on purpose.** As you draft, deliberately work in the moves that
   fit the mode (don't force all of them — pick what the passage needs):
   - Plain words; short common ones. Define anything technical the moment it appears, in
     kitchen-table language.
   - Contractions throughout. Conversational openers where natural (*So, · Well, · Now, ·
     Here's the thing,*).
   - Vary the rhythm: a couple of explaining sentences, then a short punch. Use one-line
     paragraphs for emphasis. Read it aloud in your head — it should sound spoken.
   - At least one **everyday analogy walked through step by step**, mapping the idea onto a scene
     the reader already knows — when the passage is making a point or explaining something.
   - Warmth and a little self-deprecating or wry humor. A *light* parenthetical wink is fine;
     don't put one in every paragraph.
   - Emphatic punctuation (!, an occasional ALL-CAPS word, trailing ellipses) **only at real
     peaks** — rationed, so it still means something.
   - **Nonfiction only:** open with or weave in direct address + rhetorical questions, and a
     confessional "I" anecdote; land on an uplifting, you-can-do-this close.
   - **Fiction only:** convert rhetorical questions into a character's free-indirect thought or
     cut them; turn "confession" into a character's interiority; put the comic timing into real
     dialogue.

4. **Scrub the off-voice tells** (profile §5) before you hand it back: no purple prose, no
   jargon left unexplained, no condescension/cynicism, no generic-AI fingerprints (*delve,
   tapestry, testament to, navigate the complexities, it's important to note*, em-dash-stitched
   abstractions, tricolons everywhere, contraction-free uniform sentences). If a line reads like
   a polished corporate essay, rewrite it the way Ryan would say it out loud.

5. **Obey the house rules regardless of voice.** Everything in `CLAUDE.md` still applies —
   en-US spelling by default, no sexual content, kid-friendly books read *easy* (simple names,
   plain words), and all spoiler hygiene. Voice never overrides those.

6. **Self-check (optional but recommended for anything substantial).** Before delivering, run the
   draft through the **check-my-voice** skill (or apply its rubric inline). If it scores below
   ~80%, use its top fixes and revise once. Mention the score if the user would find it useful.

## Notes

- **Match, don't caricature.** The goal is writing that reads as authentically his, not a parody
  stuffed with every tic. When in doubt, fewer, well-placed moves beat a pile of them.
- If the user pasted text to **rewrite**, preserve their meaning and facts; change only the voice.
- The richest calibration is the source books themselves (`source_materials/`, local-only) — skim
  a chapter of each for a big or unusual job. Don't reproduce long passages in committed files;
  this repo is public.
