# Tag glossary — how to tag a book

Reference for the tagging step of `create_new_book.md`. Read this **before choosing a new book's
tags** or adding a tag to an existing one. Nothing here is loaded into context by default — it is
kept out of `CLAUDE.md` deliberately, so read the file when you tag.

Tags appear on catalog cards and drive filtering. **Don't limit tagging to plot mechanics**
(crime type, audience) — tag setting, era, and subject too, whenever one is load-bearing to the
story (a boat, a specific decade, a sport, a profession). A thin tag list under-serves filtering
as much as a bloated one; the goal is that a book's tags actually describe what it's about.

**The live catalog is the source of truth for which tags exist — not this file.** Tags are book
data (`BookMeta.tags`), stored in Cosmos like everything else in the "no book-specific data in
code" principle; there is no separate tags table or endpoint. The table below is a **semantic
glossary** — what each tag means and when to use it — kept for judgment calls, not an exhaustive
or authoritative list. Never gate a "does this tag already exist" check on whether it appears
here; a tag can be live on prod without ever being added to this file. (Several already are.)

## The procedure

1. **List what the story is genuinely about** — mystery type, audience, setting/world, era, and
   any load-bearing subject (a profession, an object, a mode of transport, a sport). Don't stop
   at the crime-type tags; a book set on a 1953 sleeper train or in a 1926 dig is missing real
   information if it's only tagged `Death`.
2. **Check the existing tag list for a close match first — against the live catalog, not this
   file.** Fetch `GET /api/books` from the prod API and union every returned book's `tags` array;
   that live set is the real list of tags in use. Reuse whenever the meaning is close enough that
   two tags would just fragment the same filter (a tag for `Sea` and a tag for `Ocean` are the
   same tag — pick one and always use it). Prefer the existing wording even if your first instinct
   used different words. Use the glossary below for what each tag *means*, since the live catalog
   only gives you the bare tag strings.
3. **Only add a genuinely new tag** when nothing existing (live) covers the concept. A new tag is
   fine even if only one or two books will carry it at first (see `Wedding`, `Haunted`, `Medical`,
   `Western` below) — narrow-but-real is better than forcing a book under a tag that doesn't fit.
4. **Add the new tag(s) to the book.** If it's a genuinely new tag, also add it to the glossary
   table below with a "when to use" line — a documentation courtesy for future judgment calls,
   not a gate; the book is fully shipped (and the tag fully live) via Cosmos alone, with or
   without this table being updated. Since this is a doc-only edit to a markdown file (not app
   code), committing it does not violate the zero-code/zero-redeploy rule for adding a book.

## Glossary

Meanings only — not guaranteed exhaustive; see step 2 for the authoritative live list.

| Tag | When to use it |
|---|---|
| `AI` | AI system is a character or central to the plot |
| `Animals` | an animal is the subject of the mystery (missing, hurt, or the thing everyone is hunting) |
| `Archaeology` | an excavation/dig setting is central |
| `Art` | a painting, artwork, or its authenticity/attribution is central to the mystery |
| `Aviation` | an airplane/flight setting is central |
| `Camp` | a summer camp, scout camp, or overnight-camp session is the setting — a temporary community of kids and counselors with its own jobs, rules and rituals |
| `Cozy` | low-stakes, warm-toned, no violence |
| `Craft` | a hand trade is central — carving, quilting, casting, joinery; the mystery turns on how the thing was made, repaired, or faked |
| `Death` | a death occurs but murder is ambiguous or contested |
| `Family` | a family relationship — parent and child, siblings, a marriage — is load-bearing to the mystery's stakes or a suspect's motive |
| `Film` | movies as a business or a craft are central — a cinema, a drive-in, a projection booth, a print or a reel; the mystery turns on how a picture gets shown, shipped, or stopped (not a stage production; that's `Theater`) |
| `Games` | a game, puzzle, or played competition is central — an escape room, a puzzle chain, a games night (not an athletic contest; that's `Sport`) |
| `Gardening` | growing things is central — an allotment, a garden, a greenhouse, a horticultural show |
| `Haunted` | a haunting/ghost premise is central (real or staged) |
| `Historical` | set in a distinct past era (not present-day) |
| `Journalism` | a newspaper, newsroom, or broadcast news operation is central to the mystery |
| `Kid Friendly` | suitable for young readers (simple vocabulary, no violence) |
| `Labor` | a union, strike, or labor dispute is load-bearing to the story's stakes or a suspect's motive |
| `Legal` | a court, trial, jury, or legal proceeding is the setting or the frame — the mystery turns on a process with rules about what may be said, written down, or taken out of a room |
| `Library` | a library, archive, or a collection of books/records is the setting or the subject of the mystery |
| `Medical` | hospital/clinical setting or medical negligence is central |
| `Military` | an armed-services setting or chain of command is load-bearing — a wartime post, a ship's company, a unit under orders; the mystery turns on rank, doctrine, or what gets reported up |
| `Murder` | at least one suspect is a deliberate killer |
| `Music` | music-making, a recording, or a music business (shop, studio, band) is central to the mystery |
| `Nautical` | a boat, ship, submarine, canal, or open-water setting is central |
| `No Crime` | no crime has been committed — the mystery is a misunderstanding or loss |
| `Railway` | a train or rail setting is central |
| `Romance` | a romance thread is central to the story |
| `School` | a school setting (classroom, gym, playground, the crossing outside) is central |
| `Space` | a space station/off-world setting is central |
| `Spa` | a bathhouse, baths, or curative-water establishment is the setting — the mystery turns on the place where people go to be bathed, heated, or treated |
| `Sport` | a sporting competition or event is central |
| `Technology` | tech system or industrial setting is load-bearing to the plot |
| `Theater` | a stage/theatrical production setting is central |
| `Theft` | a genuine theft of a valuable object is the crime (a real culprit, not a misunderstanding) |
| `Wedding` | wedding or ceremony setting |
| `Western` | frontier/Western US historical setting |
| `Wine` | a vineyard/winery/winemaking setting is central |

Deliberately **not** a tag: `Mystery`. Every book on the site is a whodunit with an investigator,
so the tag carries no filtering signal — don't re-add it.
