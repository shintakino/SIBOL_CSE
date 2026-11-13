import { expect, test } from "bun:test";
import {
  allowedImageUrl,
  capturedBatch,
  digest,
  draftBatches,
  mergeBatches,
  permissionInput,
  providerKey,
  questionFingerprint,
  rasterExtension,
  reviewHtml,
  toDraft,
  topicCatalog,
} from "../scripts/content/topnotcher";

const permission = permissionInput.parse({
  provider: "topnotcher",
  attestation: "Synthetic permission fixture; no provider content in this test.",
  recordedAt: "2026-11-13T00:00:00Z",
  reference: "Fixture only",
  attribution: "Synthetic provider",
  scopes: ["questions", "answers", "explanations", "images"],
  intervalMs: 3000,
  maxRequests: 10,
});
function batch(raw: Record<string, unknown> = {}, subcategory = "basic_operations") {
  return capturedBatch.parse({
    provider: "topnotcher",
    permissionHash: digest("fixture permission"),
    category: "numerical_ability",
    subcategory,
    fetchedAt: "2026-11-13T00:00:00Z",
    questions: [
      {
        id: "fixture-1",
        type: "choice",
        text: "What is 2 + 2?",
        correct: "answer-b",
        explanation: "Adding two and two gives four.",
        choices: [
          { id: "answer-b", text: "4" },
          { id: "answer-a", text: "3" },
        ],
        ...raw,
      },
    ],
  });
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture.");
  return value;
}
function item(raw: Record<string, unknown> = {}) {
  return required(mergeBatches([batch(raw)])[0]);
}

test("provider catalog separates Professional and Subprofessional without inventing topics", () => {
  expect(topicCatalog).toHaveLength(16);
  expect(
    topicCatalog.filter((t) => (t.levels as readonly string[]).includes("professional")),
  ).toHaveLength(14);
  expect(
    topicCatalog.filter((t) => (t.levels as readonly string[]).includes("subprofessional")),
  ).toHaveLength(11);
  expect(topicCatalog[0]?.topicId).toBeNull();
});
test("permission does not silently permit absent answer/explanation scopes or aggressive collection", () => {
  expect(() => permissionInput.parse({ ...permission, scopes: ["questions"] })).toThrow();
  expect(() => permissionInput.parse({ ...permission, intervalMs: 100 })).toThrow();
  expect(() => permissionInput.parse({ ...permission, maxRequests: 100000 })).toThrow();
});
test("repeat snapshots deduplicate shuffle order while changed keys/content are held", () => {
  const first = batch();
  const second = batch({
    choices: [
      { id: "answer-a", text: "3" },
      { id: "answer-b", text: "4" },
    ],
  });
  expect(mergeBatches([first, second])).toHaveLength(1);
  expect(mergeBatches([first, second])[0]?.conflict).toBe(false);
  expect(questionFingerprint(required(first.questions[0]))).toBe(
    questionFingerprint(required(second.questions[0])),
  );
  const conflict = required(mergeBatches([first, batch({ correct: "answer-a" })])[0]);
  expect(conflict.conflict).toBe(true);
  expect(() => toDraft(conflict, "professional", permission)).toThrow();
  expect(() => mergeBatches([{ ...first, subcategory: "unregistered" }])).toThrow();
});
test("native choice remapping preserves the provider key, passage and source attribution", () => {
  const draft = toDraft(item({ passage: "Read this passage first." }), "professional", permission);
  expect(draft.answerChoiceId).toBe("c1");
  expect(draft.choices.find((c) => c.id === draft.answerChoiceId)?.text).toBe("4");
  expect(draft.passage).toBe("Read this passage first.");
  expect(draft.source.rights).toBe("permitted");
  expect(draft.source.author).toBe(permission.attribution);
  expect(draft.externalId).toBe(`topnotcher-professional-${providerKey("fixture-1")}`);
  expect(draft.externalId.length).toBeLessThanOrEqual(100);
  expect(() => toDraft(item({ correct: "absent" }), "professional", permission)).toThrow();
  expect(() =>
    toDraft(
      item({
        choices: [
          { id: "a", text: "1" },
          { id: "a", text: "2" },
        ],
      }),
      "professional",
      permission,
    ),
  ).toThrow();
});
test("shuffled paragraph items are equivalent but their correct sequence is significant", () => {
  const first = batch({
    type: "order",
    items: [
      { id: "a", text: "First." },
      { id: "b", text: "Second." },
    ],
    correct: ["a", "b"],
  });
  const shuffled = batch({
    type: "order",
    items: [
      { id: "b", text: "Second." },
      { id: "a", text: "First." },
    ],
    correct: ["a", "b"],
  });
  expect(mergeBatches([first, shuffled])[0]?.conflict).toBe(false);
  expect(
    mergeBatches([first, batch({ ...shuffled.questions[0], correct: ["b", "a"] })])[0]?.conflict,
  ).toBe(true);
});
test("ordering, image choices and unreviewed image descriptions never degrade to text-only questions", () => {
  expect(() =>
    toDraft(item({ type: "order", correct: ["a", "b"] }), "professional", permission),
  ).toThrow();
  expect(() =>
    toDraft(
      item({
        choices: [
          { id: "answer-b", text: "4", image: "https://topnotcher.ph/wp-content/uploads/a.png" },
          { id: "answer-a", text: "3" },
        ],
      }),
      "professional",
      permission,
    ),
  ).toThrow();
  const image = item({ image: "https://topnotcher.ph/wp-content/uploads/a.png" });
  expect(() => toDraft(image, "professional", permission)).toThrow();
  expect(
    toDraft(image, "professional", permission, {
      image: { src: "/media/test.png", alt: "Four counters in two pairs." },
    }).media?.src,
  ).toBe("/media/test.png");
  expect(() =>
    toDraft(image, "professional", permission, {
      image: { src: "https://external.example/a.png", alt: "Four counters." },
    }),
  ).toThrow();
});
test("unsupported HTML, missing explanations and unmapped general information are held for editors", () => {
  expect(() =>
    toDraft(item({ text: "<script>alert(1)</script>" }), "professional", permission),
  ).toThrow();
  expect(() => toDraft(item({ explanation: "" }), "professional", permission)).toThrow();
  const general = {
    ...batch(),
    category: "general_information",
    subcategory: "general_information",
  };
  const row = required(mergeBatches([general])[0]);
  expect(() => toDraft(row, "professional", permission)).toThrow();
  expect(
    toDraft(row, "professional", permission, { topicId: "general-constitution" }).topicId,
  ).toBe("general-constitution");
  expect(() =>
    toDraft(row, "professional", permission, { topicId: "numerical-arithmetic" }),
  ).toThrow();
});
test("image downloads reject other origins, credentials, redirects' destinations and active formats", () => {
  expect(allowedImageUrl("/wp-content/uploads/a.png").hostname).toBe("topnotcher.ph");
  for (const url of [
    "http://topnotcher.ph/wp-content/uploads/a.png",
    "https://topnotcher.ph.evil.test/wp-content/uploads/a.png",
    "https://topnotcher.ph@127.0.0.1/wp-content/uploads/a.png",
    "https://topnotcher.ph:8443/wp-content/uploads/a.png",
    "https://topnotcher.ph/wp-content/uploads/../../private.png",
    "https://topnotcher.ph/wp-content/uploads/a.png?redirect=http://localhost",
  ])
    expect(() => allowedImageUrl(url)).toThrow();
  expect(rasterExtension(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toBe(
    "png",
  );
  expect(() => rasterExtension(new TextEncoder().encode("<svg></svg>"), "image/svg+xml")).toThrow();
  expect(() =>
    rasterExtension(new TextEncoder().encode("<html>error</html>"), "image/png"),
  ).toThrow();
});
test("native batches respect both row and UTF-8 byte limits without dropping rows", () => {
  const row = toDraft(item(), "professional", permission);
  const rows = Array.from({ length: 210 }, (_, i) => ({
    ...row,
    externalId: `fixture-${i}`,
    prompt: `${"漢".repeat(5000)} ${i}`,
  }));
  const batches = draftBatches(rows).map((b) => JSON.parse(b));
  expect(batches.flat()).toHaveLength(210);
  for (const b of batches) {
    expect(b.length).toBeLessThanOrEqual(100);
    expect(Buffer.byteLength(JSON.stringify(b))).toBeLessThanOrEqual(512 * 1024);
  }
});
test("offline review escapes provider markup and embeds only local content-hashed images", () => {
  const dangerous = item({
    text: '<script>alert(1)</script><img src=x onerror="alert(2)">',
    image: "https://provider.example/a.png",
  });
  const html = reviewHtml(
    [dangerous],
    [{ url: "https://provider.example/a.png", file: 'https://evil.test/a.png" onerror="alert(3)' }],
  );
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("https://evil.test");
  expect(html).toContain("default-src 'none'");
  const local = `images/${"a".repeat(64)}.png`;
  expect(
    reviewHtml([dangerous], [{ url: "https://provider.example/a.png", file: local }]),
  ).toContain(`src="${local}"`);
});

test("GIF originals can be archived without adding animation to native questions or review pages", () => {
  expect(rasterExtension(new TextEncoder().encode("GIF89a"), "image/gif")).toBe("gif");
  const q = item({ image: "https://topnotcher.ph/wp-content/uploads/a.gif" });
  expect(() =>
    toDraft(q, "professional", permission, {
      image: { src: "/media/test.gif", alt: "A reviewed figure." },
    }),
  ).toThrow();
  const file = `images/${"b".repeat(64)}.gif`;
  const html = reviewHtml([q], [{ url: "https://topnotcher.ph/wp-content/uploads/a.gif", file }]);
  expect(html).toContain(`href="${file}"`);
  expect(html).not.toContain(`src="${file}"`);
});
