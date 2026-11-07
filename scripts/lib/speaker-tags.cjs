// Shared handling of the inline dialogue speaker tags (`{{say:<speaker-id>}}`) that drive
// multi-voice read-aloud. They are audio-only markup: the API strips them when it loads a book,
// so every script that reads chapter/ending .md files directly must strip them the same way —
// otherwise word counts include them and cross-reference offsets point at the wrong characters.
//
// TOKEN must stay byte-for-byte the pattern in ai-mysteries-api/Services/SpeakerTags.cs: any
// say-token plus the spaces/tabs right after it (newlines are kept; they may be a paragraph break).

const fs = require("fs");

const TOKEN = /\{\{say:([^}]*)\}\}[ \t]*/g;

// A well-formed speaker id: kebab case, like the glossary keys.
const VALID_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const stripSpeakerTags = (text) => (text.includes("{{say:") ? text.replace(TOKEN, "") : text);

// A chapter/ending body as readers (and the API) see it, or null when the file is missing.
function readBody(file) {
  return fs.existsSync(file) ? stripSpeakerTags(fs.readFileSync(file, "utf8")) : null;
}

module.exports = { TOKEN, VALID_ID, stripSpeakerTags, readBody };
