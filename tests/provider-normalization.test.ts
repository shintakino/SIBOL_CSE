import { expect, test } from "bun:test";
import { assertMediaReviewed } from "@sibol-cse/api/services/content-media";
import {
  normalizeSharedQuestion,
  prepareSourceSnapshot,
} from "../scripts/content/shared-topnotcher";
import { permissionInput, providerKey, type StagedQuestion } from "../scripts/content/topnotcher";

const permission = permissionInput.parse({
  provider: "topnotcher",
  attestation: "Synthetic permission fixture for original software tests.",
  recordedAt: "2026-11-13T00:00:00Z",
  reference: "Fixture only",
  attribution: "Synthetic provider",
  scopes: ["questions", "answers", "explanations", "images"],
  intervalMs: 3000,
  maxRequests: 10,
});
function source(
  raw: Record<string, unknown> = {},
  category = "numerical_ability",
  subcategory = "basic_operations",
): StagedQuestion {
  const q = {
    id: "synthetic-source",
    type: "choice",
    text: "What is 2 + 2?",
    explanation: "Two plus two equals four.",
    choices: [
      { id: "a", text: "3" },
      { id: "b", text: "4" },
    ],
    correct: "b",
    ...raw,
  };
  return { id: q.id, key: providerKey(q.id), category, subcategory, raw: q, conflict: false };
}
test("shared identity ignores provider IDs and choice shuffles without changing the key", () => {
  const a = normalizeSharedQuestion(source(), permission, {});
  const b = normalizeSharedQuestion(
    source({
      id: "different-provider-id",
      choices: [
        { id: "x", text: "4" },
        { id: "y", text: "3" },
      ],
      correct: "x",
    }),
    permission,
    {},
  );
  expect(a.question.levels).toEqual(["professional", "subprofessional"]);
  expect(a.question.externalId).toBe(b.question.externalId);
  expect(a.question.answerChoiceId).toBe(b.question.answerChoiceId);
  expect(a.fingerprint).toBe(b.fingerprint);
});
test("ordering normalization preserves instruction and the correct sentence sequence", () => {
  const q = source(
    {
      type: "order",
      text: "Arrange a coherent paragraph.",
      instruction: "Order these sentences.",
      choices: [],
      items: [
        { id: "3", text: "Finally, finish." },
        { id: "1", text: "First, begin." },
        { id: "2", text: "Then, continue." },
      ],
      correct: ["1", "2", "3"],
    },
    "verbal_ability",
    "paragraph_organization",
  );
  const normalized = normalizeSharedQuestion(q, permission, {}).question;
  expect(normalized.answerChoiceId).toBeNull();
  expect(normalized.choices).toHaveLength(0);
  expect(normalized.instruction).toBe("Order these sentences.");
  expect(
    normalized.answerOrder?.map((id) => normalized.orderItems.find((i) => i.id === id)?.text),
  ).toEqual(["First, begin.", "Then, continue.", "Finally, finish."]);
});
test("image choice keys stay attached to their image content and unreviewed descriptions block review", () => {
  const a = "https://topnotcher.ph/wp-content/uploads/a.png",
    b = "https://topnotcher.ph/wp-content/uploads/b.png";
  const assets = {
    [a]: { src: `/api/content-media/${"a".repeat(64)}.png`, archivalOnly: false },
    [b]: { src: `/api/content-media/${"b".repeat(64)}.png`, archivalOnly: false },
  };
  const q = source(
    {
      choices: [
        { id: "b", text: "", image: b },
        { id: "a", text: "", image: a },
      ],
      correct: "a",
    },
    "analytical_ability",
    "symbolic_logic_abstract_reasoning",
  );
  const normalized = normalizeSharedQuestion(q, permission, assets);
  expect(
    normalized.question.choices.find((c) => c.id === normalized.question.answerChoiceId)?.media
      ?.src,
  ).toBe(assets[a]?.src);
  expect(normalized.holds.length).toBeGreaterThan(0);
  expect(() => assertMediaReviewed(normalized.question.choices.map((c) => c.media))).toThrow();
  expect(normalized.question.levels).toEqual(["professional"]);
});
test("error recognition retains referenced labels and instruction", () => {
  const normalized = normalizeSharedQuestion(
    source(
      {
        type: "error",
        text: "(A) It (B) are ready.",
        instruction: "Choose the erroneous segment.",
        choices: [
          { id: "b", text: "are" },
          { id: "a", text: "It" },
        ],
        correct: "b",
      },
      "verbal_ability",
      "error_recognition",
    ),
    permission,
    {},
  ).question;
  expect(normalized.choices.map((c) => c.label)).toEqual(["A", "B"]);
  expect(normalized.answerChoiceId).toBe("b");
  expect(normalized.prompt).toContain("(B)");
});
test("source bucket and assessed topic remain separate and out-of-scope items stay held", () => {
  const q = source({}, "general_information", "general_information");
  expect(prepareSourceSnapshot(q, permission, {}).native).toBeNull();
  const classified = prepareSourceSnapshot(
    q,
    permission,
    {},
    {
      topicId: "verbal-vocabulary",
      classificationReason: "Source General Information bucket includes a vocabulary definition.",
    },
  );
  expect(classified.native?.topicId).toBe("verbal-vocabulary");
  expect(classified.native?.provider?.category).toBe("general_information");
  const held = prepareSourceSnapshot(
    q,
    permission,
    {},
    { holdReason: "Unrelated technology trivia; outside enabled assessment topics." },
  );
  expect(held.native).toBeNull();
  expect(held.raw).toEqual(q.raw);
});
test("ambiguous choices and malformed ordering keys cannot become graded native questions", () => {
  expect(
    prepareSourceSnapshot(
      source({
        choices: [
          { id: "a", text: "same" },
          { id: "b", text: "same" },
        ],
      }),
      permission,
      {},
    ).native,
  ).toBeNull();
  const bad = source(
    {
      type: "order",
      choices: [],
      items: [
        { id: "1", text: "First." },
        { id: "2", text: "Second." },
      ],
      correct: ["1", "1"],
    },
    "verbal_ability",
    "paragraph_organization",
  );
  expect(prepareSourceSnapshot(bad, permission, {}).native).toBeNull();
});
