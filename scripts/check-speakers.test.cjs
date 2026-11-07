// node --test scripts/check-speakers.test.cjs   (from the repo root)
// Runs check-speakers.cjs the way an author does, over the API test project's placeholder books.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SCRIPT = path.join(__dirname, "check-speakers.cjs");
const FIXTURES = path.join(__dirname, "..", "ai-mysteries-api.Tests", "Fixtures", "Content");

function run(bookId, content) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [SCRIPT, bookId, "--content", content], { encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout) };
  }
}

// A scratch copy of the voiced fixture with one chapter file replaced.
function withChapter(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "speakers-"));
  fs.cpSync(path.join(FIXTURES, "voiced-book"), path.join(dir, "voiced-book"), { recursive: true });
  fs.writeFileSync(path.join(dir, "voiced-book", "book", "opening.md"), body);
  return dir;
}

test("a correctly tagged book passes", () => {
  const r = run("voiced-book", FIXTURES);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /check-speakers: voiced-book: OK \(2 cast voice\(s\)\)/);
});

test("a book with no cast and no tags passes", () => {
  const r = run("plain-book", FIXTURES);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /no voice cast/);
});

test("an unknown speaker id fails", () => {
  const r = run("voiced-book", withChapter('{{say:stranger}}"Who am I?" he asked.\n'));
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /book[\\/]opening\.md:1: tags speaker "stranger", which is not in voices\.cast \(inspector, cook\)/);
});

test("a malformed token fails", () => {
  const r = run("voiced-book", withChapter('{{say: Cook}}"Hi," he said.\n'));
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /malformed speaker tag \{\{say: Cook\}\}/);
});

test("a tag with no quote after it fails", () => {
  const r = run("voiced-book", withChapter("{{say:cook}}He said nothing at all.\n"));
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /\{\{say:cook\}\} has no quote after it/);
});

test("untagged dialogue in a cast book only warns", () => {
  const r = run("voiced-book", withChapter('"Hi," he said.\n\n{{say:cook}}"Bye," he said.\n'));
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /warn {2}book[\\/]opening\.md:1: quoted dialogue with no speaker tag/);
});
