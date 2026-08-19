/**
 * THE AGENT CANNOT PUBLISH — proven at the layer that decides, not by convention.
 *
 * The whole workflow rests on one property: Career OS can put an article in front of Ani
 * and cannot put one in front of the public. A comment saying so is worth nothing; these
 * pin the two mechanisms that actually enforce it — what the agent is allowed to SAY, and
 * which posts it is allowed to touch.
 */
import { describe, it, expect, afterEach } from "vitest";
import { agentFields, agentReadable, agentMayEdit, blogAgentConfigured } from "./blogAgent";

describe("what the agent may say", () => {
  it("keeps the fields an article needs", () => {
    const out = agentFields({ title: "T", excerpt: "E", body: "B", slug: "s", evidence: ["a"], decisionRef: "d", expectedOutcome: "o", measurementHorizonDays: 28 });
    expect(Object.keys(out).sort()).toEqual(["body", "decisionRef", "evidence", "excerpt", "expectedOutcome", "measurementHorizonDays", "slug", "title"]);
  });

  it("may choose a cover image and describe it — neither grants any publishing power", () => {
    const out = agentFields({ coverImage: "/img/artwork/12/0", coverImageAlt: "A blue seascape", status: "published" });
    expect(out).toEqual({ coverImage: "/img/artwork/12/0", coverImageAlt: "A blue seascape" });
    // The image fields ride along; `status` is still dropped on the same call.
    expect(out).not.toHaveProperty("status");
  });

  it("drops status — the agent cannot even express going live", () => {
    const out = agentFields({ title: "T", status: "published" });
    expect(out).not.toHaveProperty("status");
    expect(out.title).toBe("T");
  });

  it("drops publishedAt and origin — it cannot forge when or who", () => {
    const out = agentFields({ title: "T", publishedAt: new Date(), origin: "manual", id: 9 });
    expect(out).toEqual({ title: "T" });
  });
});

describe("which posts the agent may revise", () => {
  it("its own draft, yes", () => {
    expect(agentMayEdit({ origin: "career_os", status: "draft" }).ok).toBe(true);
  });

  it("a published post of its own, no — a live page must not change under the owner", () => {
    const r = agentMayEdit({ origin: "career_os", status: "published" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only the owner/i);
  });

  it("the owner's own writing, no, draft or not", () => {
    expect(agentMayEdit({ origin: "manual", status: "draft" }).ok).toBe(false);
    expect(agentMayEdit({ origin: "manual", status: "published" }).ok).toBe(false);
  });

  it("a post that does not exist, no", () => {
    expect(agentMayEdit(undefined).ok).toBe(false);
  });
});

describe("the credential fails closed", () => {
  const original = process.env.BLOG_AGENT_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.BLOG_AGENT_TOKEN;
    else process.env.BLOG_AGENT_TOKEN = original;
  });

  it("unset means the agent path is SHUT, not open to everyone", () => {
    delete process.env.BLOG_AGENT_TOKEN;
    expect(blogAgentConfigured()).toBe(false);
  });

  it("a short token is refused rather than quietly accepted", () => {
    process.env.BLOG_AGENT_TOKEN = "short";
    expect(blogAgentConfigured()).toBe(false);
  });

  it("a real token configures it", () => {
    process.env.BLOG_AGENT_TOKEN = "x".repeat(48);
    expect(blogAgentConfigured()).toBe(true);
  });
});

describe("what the agent may read back", () => {
  const row = {
    id: 3, slug: "s", title: "T", status: "draft", excerpt: "E", body: "B",
    origin: "career_os", decisionRef: "exp-001", publishedAt: null,
    coverImage: null, coverImageAlt: null,
  };

  it("returns the prose, because duplication lives in the prose and not in the title", () => {
    const out = agentReadable(row);
    expect(out.body).toBe("B");
    expect(out.excerpt).toBe("E");
    expect(out.title).toBe("T");
  });

  it("shows status, so a draft can be compared against — reading it is not setting it", () => {
    expect(agentReadable(row).status).toBe("draft");
    // The write side still refuses the same field.
    expect(agentFields({ status: "published" })).not.toHaveProperty("status");
  });

  it("is an allowlist — a column added to the table later is not exposed by accident", () => {
    const out = agentReadable({ ...row, adminNotes: "private", internalScore: 9 });
    expect(out).not.toHaveProperty("adminNotes");
    expect(out).not.toHaveProperty("internalScore");
  });

  it("omits absent fields rather than inventing nulls for them", () => {
    expect(agentReadable({ id: 1 })).toEqual({ id: 1 });
  });
});
