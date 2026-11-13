import { type LessonInput, questionInput } from "@sibol-cse/api/learning-contracts";
import type { Database } from "@sibol-cse/db";
import {
  choice,
  contentSource,
  examProfileVersion,
  lesson,
  lessonVersion,
  question,
  questionVersion,
  topic,
} from "@sibol-cse/db/schema";
export const checklist = {
  accurate: true,
  explanation: true,
  rights: true,
  alignment: true,
  accessible: true,
} as const;
export const source = {
  title: "Original test fixture",
  author: "Sibol tests",
  rights: "original" as const,
  rightsStatement: "Synthetic fixture for software verification, not reviewed learning material.",
  url: null,
  references: [],
};
export const taxonomy = [
  ["verbal", "Vocabulary"],
  ["verbal", "Grammar"],
  ["verbal", "Sentence construction"],
  ["verbal", "Paragraph ordering"],
  ["verbal", "Comprehension"],
  ["numerical", "Arithmetic"],
  ["numerical", "Sequences"],
  ["numerical", "Applied word problems"],
  ["general", "Constitution"],
  ["general", "Public-service ethics"],
  ["general", "Peace and human rights"],
  ["general", "Environmental protection"],
  ["analytical", "Analogies"],
  ["analytical", "Abstract logic"],
  ["analytical", "Assumptions and conclusions"],
  ["analytical", "Interpreting data"],
  ["clerical", "Filing"],
  ["clerical", "Spelling"],
];
export const structure = {
  concept: [
    { type: "text" as const, text: "A test concept. < and > can be mathematical comparisons." },
  ],
  workedExample: [{ type: "math" as const, text: "2 + 2 = 4" }],
  commonMistake: [{ type: "text" as const, text: "Read every condition." }],
  technique: [
    {
      type: "diagram" as const,
      caption: "A simple reasoning sequence",
      steps: ["Read the question", "Check the result"],
    },
  ],
};
export function questionDraft(externalId: string, topicId = "numerical-arithmetic") {
  return questionInput.parse({
    externalId,
    level: "professional",
    topicId,
    language: "english",
    difficulty: "easy",
    prompt: `${externalId}: What is 2 + 2?`,
    choices: [
      { id: "a", text: "3" },
      { id: "b", text: "4" },
      { id: "c", text: "5" },
    ],
    answerChoiceId: "b",
    explanation: "Add two to two to obtain four.",
    source,
  });
}
export function lessonDraft(slug: string, topicId = "numerical-arithmetic"): LessonInput {
  return {
    slug,
    title: "A clear worked example",
    topicId,
    levels: ["professional"],
    structure,
    source,
  };
}
export async function seedLearning(
  db: Database,
  adminId: string,
  perTopic = 20,
  examLevel: "professional" | "subprofessional" = "professional",
  realisticPayload = false,
) {
  const prefix = examLevel === "professional" ? "fixture" : `fixture-${examLevel}`;
  return db.transaction(async (tx) => {
    const topics = taxonomy.map(([area, title]) => {
      if (!area || !title) throw new Error("Fixture taxonomy missing");
      return {
        id: `${area}-${title.toLowerCase().replaceAll(" ", "-")}`,
        slug: `${area}-${title.toLowerCase().replaceAll(" ", "-")}`,
        title,
        area,
        levels:
          area === "analytical"
            ? ["professional" as const]
            : area === "clerical"
              ? ["subprofessional" as const]
              : ["professional" as const, "subprofessional" as const],
      };
    });
    await tx.insert(topic).values(topics).onConflictDoNothing();
    const [s] = await tx
      .insert(contentSource)
      .values({
        title: source.title,
        rights: JSON.stringify(source),
        verifiedAt: new Date(),
        reviewerId: adminId,
      })
      .returning();
    if (!s) throw new Error("Fixture source missing");
    const [profile] = await tx
      .insert(examProfileVersion)
      .values({
        level: examLevel,
        version: 99,
        itemCount: examLevel === "professional" ? 150 : 145,
        durationMinutes: examLevel === "professional" ? 190 : 160,
        diagnosticCount: 30,
        sourceUrl: "https://csc.gov.ph/test-fixture",
        sourceTitle: "Test-only profile metadata",
        verifiedAt: new Date(),
        reviewerId: adminId,
        active: true,
      })
      .returning();
    if (!profile) throw new Error("Fixture profile missing");
    const prof = topics.filter((t) => t.levels.some((supported) => supported === examLevel));
    const qs: (typeof question.$inferInsert)[] = [];
    const vs: (typeof questionVersion.$inferInsert)[] = [];
    const cs: (typeof choice.$inferInsert)[] = [];
    for (const t of prof) {
      const lessonId = crypto.randomUUID();
      await tx.insert(lesson).values({ id: lessonId, slug: `${prefix}-${t.slug}` });
      await tx.insert(lessonVersion).values({
        lessonId,
        version: 1,
        status: "published",
        title: `${t.title}: a worked example`,
        topicId: t.id,
        levels: [examLevel],
        sourceId: s.id,
        body: JSON.stringify(structure),
        structure,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        publishedAt: new Date(),
        reviewChecklist: checklist,
      });
      for (let n = 0; n < perTopic; n++) {
        const qid = crypto.randomUUID(),
          vid = crypto.randomUUID();
        qs.push({ id: qid, externalId: `${prefix}-${t.slug}-${n}` });
        vs.push({
          id: vid,
          questionId: qid,
          version: 1,
          status: "draft",
          level: examLevel,
          language: "english",
          difficulty: "easy",
          prompt: `${t.title} fixture ${n + 1}: What is 2 + 2?${realisticPayload ? " Synthetic load scenario: review the supplied conditions, distinguish relevant details and select the justified conclusion. This paragraph is software-test data and does not represent released civil-service learning material.".repeat(5) : ""}`,
          answerChoiceId: "b",
          explanation: "Two plus two equals four.",
          primaryTopicId: t.id,
          sourceId: s.id,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          publishedAt: new Date(),
          reviewChecklist: checklist,
        });
        for (const [id, text] of [
          ["a", "3"],
          ["b", "4"],
          ["c", "5"],
        ])
          if (id && text)
            cs.push({
              questionVersionId: vid,
              id,
              text: realisticPayload
                ? `${text}. A synthetic option with enough explanatory wording to approximate the payload of an ordinary reviewed multiple-choice item.`
                : text,
            });
      }
    }
    await tx.insert(question).values(qs);
    await tx.insert(questionVersion).values(vs);
    await tx.insert(choice).values(cs);
    const { eq, inArray } = await import("drizzle-orm");
    await tx
      .update(questionVersion)
      .set({ status: "published" })
      .where(
        inArray(
          questionVersion.id,
          vs.map((v) => String(v.id)),
        ),
      );
    const [arithmetic] = await tx
      .select({ id: topic.id })
      .from(topic)
      .where(eq(topic.id, "numerical-arithmetic"));
    if (!arithmetic) throw new Error("Fixture topic missing");
    return { profileId: profile.id, topics: prof };
  });
}
