/**
 * THE PATH NARRATIVE — Ani's own first-person writing, as data.
 *
 * WHY THIS FILE EXISTS. `/path` carries roughly 820 words of her writing about the
 * periods of her practice: what a landscape means to her, why minimalism, how the work
 * changed. It was reaching nobody. The page is client-rendered, so a crawler — Google's or
 * ours — receives a 39-character shell, and the strongest first-party material on the site
 * was invisible to search engines and to the article pipeline that exists to say only what
 * she has said.
 *
 * The text lives here so the server can render it into the HTML the way `/blog` already
 * does, rather than a second copy being written for crawlers. `pathNarrative.test.ts`
 * asserts every paragraph still appears verbatim in `PathPage.tsx`, so the two cannot
 * drift apart silently.
 *
 * HER WORDS. Copy them, reorder them, cut them — but do not rewrite them here to read
 * better. This is the file the article writer will be told it may quote from.
 */

export interface PathChapter {
  title: string;
  /** The one-line arc under the chapter title. */
  arc: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

export interface PathNarrative {
  intro: string[];
  chapters: PathChapter[];
  /**
   * The lines the page sets as pull-quotes and bridges between chapters. Kept because they
   * are not repeats of the body — "the heaviness did not disappear by being denied"
   * appears nowhere else — and because they are the most distilled statements she makes.
   */
  pullQuotes: string[];
  /** The unwritten fourth chapter, in her voice. Excludes the newsletter mechanics. */
  closing: string[];
}

export const PATH_NARRATIVE: PathNarrative = {
  intro: [
    "What you are about to read is not a portfolio. It is a path — the slow becoming of an artist and her art.",
    "For years I painted while waiting to feel ready to be seen. The canvas held what I could not yet say in words: it carried weight before I understood the weight was mine, then slowly opened into space and breath. Each painting in this book is an expression of the period I was living through when I made it.",
    "Read it slowly, the way it was lived. Three chapters are written. The fourth is not — and that one, you can witness.",
  ],
  chapters: [
    {
      title: "The Weight Within",
      arc: "Where it began: the first honest canvases — and the fears I did not yet have words for.",
      sections: [
        {
          heading: "Standing before my own voice",
          paragraphs: [
            "This chapter began at a moment when I was still learning how to stand in front of my own voice.",
            "Although I had studied art and had been painting for years, I still felt like a student inside. I was not unsure of my love for painting — that had always been clear — but I was unsure whether I was ready to bring my work into the world. I kept waiting for a certain mastery, a moment when I would finally feel prepared enough to be seen.",
          ],
        },
        {
          heading: "What appeared on the canvas",
          paragraphs: [
            "The works that followed were heavy, even before I fully understood why. They carried dark colours, quiet figures, women turned inward, ravens, silence, and a kind of emotional weight that seemed to live beneath the surface.",
            "At the time, I was surprised by what appeared on the canvas. Only later did I understand that I was painting what I had been carrying inside.",
          ],
        },
        {
          heading: "Difficult, but necessary",
          paragraphs: [
            "This period was difficult, but necessary. It was the place where the weight inside me first became visible. The canvas became a space where I could release what I could not yet explain in words.",
          ],
        },
      ],
    },
    {
      title: "Toward My Own Language",
      arc: "Where the weight became space, and I began to speak in my own language.",
      sections: [
        {
          heading: "Space enters",
          paragraphs: [
            "Something changed when I understood that I did not have to carry every burden that had once felt like mine.",
            "That realization brought space into my life — and then into my paintings. I began to feel breath, choice, trust, and a new kind of inner freedom. My visual language started to change with me. The works became lighter, cleaner, more open. The forms became quieter, but not less emotional.",
          ],
        },
        {
          heading: "Minimalism as maturity",
          paragraphs: [
            "For me, minimalism is not emptiness. It is not a lack of feeling. It is a form of maturity. It is the moment when an artist no longer needs to say everything loudly. A single line can carry what ten lines once tried to explain. A quiet field of colour can hold an entire emotional landscape.",
          ],
        },
        {
          heading: "A landscape is never only a place",
          paragraphs: [
            "Although landscapes became more present in my work, I was still painting the inner world of a person. A landscape, for me, is never only a place. It can be a state of mind, a memory, a longing, a pause, or a movement toward something more honest.",
          ],
        },
      ],
    },
    {
      title: "Returning Changed",
      arc: "Where I return changed — more mature, more joyful, closer to true.",
      sections: [
        {
          heading: "Leaving the familiar",
          paragraphs: [
            "My current work is about transformation.",
            "I am interested in the moment when a person steps outside the familiar — outside comfort, habit, safety, and everything they already know. At first, the space is unknown. It may feel empty, uncertain, even fragile. But slowly, something opens. The person begins to see differently. They move through obstacles, through silence, through distance, and return changed.",
          ],
        },
        {
          heading: "Quiet passages",
          paragraphs: [
            "This journey feels close to my own.",
            "I see my paintings as quiet passages. A figure at the edge of a space. A distant horizon. A field of light. A body turned toward something unseen. These are not literal stories, but emotional thresholds — places where the inner life begins to shift.",
          ],
        },
        {
          heading: "No longer separate",
          paragraphs: [
            "In this chapter, I no longer feel separate from painting. Earlier, I used to stand before art with reverence, almost as if it were something outside of me. I still feel that reverence, but now the distance has changed. Painting is no longer only something I do. It has become part of how I understand life, how I move through it, and how I return to myself.",
          ],
        },
      ],
    },
  ],
  pullQuotes: [
    "The canvas became the place where the weight inside me first became visible.",
    "But weight, once seen, begins to ask for space.",
    "The heaviness did not disappear by being denied. It transformed into space.",
    "And space, once entered, asks to be crossed.",
    "They move through obstacles, through silence, through distance, and return changed.",
  ],
  closing: [
    "This is where the printed pages end. The path does not — it is still being painted.",
    "I have come to a point of being closer to who I truly am — and I came here through truth. Truth is my only compass now. It is what keeps me on this path.",
    "Somewhere in my studio, a canvas is still white. I do not know yet what it will carry — only that it will be true.",
  ],
};


/** Every paragraph in reading order — what a crawler, or a writer, should see. */
export function pathParagraphs(n: PathNarrative = PATH_NARRATIVE): string[] {
  return [
    ...n.intro,
    ...n.chapters.flatMap((c) => [c.arc, ...c.sections.flatMap((s) => s.paragraphs)]),
    ...n.pullQuotes,
    ...n.closing,
  ];
}
