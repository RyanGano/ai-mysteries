import prologue from "./prologue.md?raw";
import chapter1 from "./chapter-1.md?raw";
import chapter2 from "./chapter-2.md?raw";
import chapter3 from "./chapter-3.md?raw";
import chapter4 from "./chapter-4.md?raw";
import chapter5 from "./chapter-5.md?raw";
import chapter6 from "./chapter-6.md?raw";
import chapter7 from "./chapter-7.md?raw";
import chapter8 from "./chapter-8.md?raw";
import chapter9 from "./chapter-9.md?raw";
import chapter10 from "./chapter-10.md?raw";
import chapter11 from "./chapter-11.md?raw";
import chapter12 from "./chapter-12.md?raw";
import chapter13 from "./chapter-13.md?raw";
import chapter14 from "./chapter-14.md?raw";
import chapter15 from "./chapter-15.md?raw";
import epilogue from "./epilogue.md?raw";

export interface Chapter {
  slug: string;
  title: string;
  body: string;
}

// The book, in reading order. Prologue → Chapters 1–15 → Epilogue.
export const chapters: Chapter[] = [
  {
    slug: "prologue",
    title: "Prologue",
    body: prologue,
  },
  {
    slug: "chapter-1",
    title: "Chapter 1 — Arrival",
    body: chapter1,
  },
  {
    slug: "chapter-2",
    title: "Chapter 2 — The Scene",
    body: chapter2,
  },
  {
    slug: "chapter-3",
    title: "Chapter 3 — The People",
    body: chapter3,
  },
  {
    slug: "chapter-4",
    title: "Chapter 4 — The Company",
    body: chapter4,
  },
  {
    slug: "chapter-5",
    title: "Chapter 5 — What the System Is Supposed to Do",
    body: chapter5,
  },
  {
    slug: "chapter-6",
    title: "Chapter 6 — The Suit",
    body: chapter6,
  },
  {
    slug: "chapter-7",
    title: "Chapter 7 — SAM",
    body: chapter7,
  },
  {
    slug: "chapter-8",
    title: "Chapter 8 — Marcus Rourke",
    body: chapter8,
  },
  {
    slug: "chapter-9",
    title: "Chapter 9 — Priya Shah",
    body: chapter9,
  },
  {
    slug: "chapter-10",
    title: "Chapter 10 — Elias Varga",
    body: chapter10,
  },
  {
    slug: "chapter-11",
    title: "Chapter 11 — Jonah Pike",
    body: chapter11,
  },
  {
    slug: "chapter-12",
    title: "Chapter 12 — Renée Calder",
    body: chapter12,
  },
  {
    slug: "chapter-13",
    title: "Chapter 13 — The Gap",
    body: chapter13,
  },
  {
    slug: "chapter-14",
    title: "Chapter 14 — The Fifteen Minutes",
    body: chapter14,
  },
  {
    slug: "chapter-15",
    title: "Chapter 15 — What Happened That Morning",
    body: chapter15,
  },
  {
    slug: "epilogue",
    title: "Epilogue",
    body: epilogue,
  },
];
