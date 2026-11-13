import { expect, test } from "bun:test";
import {
  addDays,
  consistency,
  planSlots,
  reviewTransition,
  studyDate,
} from "@sibol-cse/api/services/learning-policy";

test("calendar dates honor timezone, month and leap boundaries", () => {
  expect(studyDate(new Date("2026-11-12T16:01:00Z"), "Asia/Manila")).toBe("2026-11-13");
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
});
test("reviews advance once per due day, reset on mistakes, and respect manual tomorrow", () => {
  const base = { today: "2026-11-12", dueOn: "2026-11-12", step: 0, lastReviewedOn: null };
  let next = reviewTransition({ ...base, outcome: "correct" });
  expect(next).toEqual({ step: 1, dueOn: "2026-11-15", lastReviewedOn: "2026-11-12" });
  expect(reviewTransition({ ...base, ...next, outcome: "correct" })).toEqual(next);
  for (const [step, days] of [
    [1, 7],
    [2, 14],
    [3, 30],
    [4, 30],
  ]) {
    expect(reviewTransition({ ...base, step: step ?? 0, outcome: "correct" }).dueOn).toBe(
      addDays(base.today, days ?? 0),
    );
  }
  next = reviewTransition({ ...base, step: 3, outcome: "tomorrow" });
  expect(next.step).toBe(0);
  expect(reviewTransition({ ...base, ...next, outcome: "correct" })).toEqual(next);
  expect(reviewTransition({ ...base, step: 4, outcome: "incorrect" }).dueOn).toBe("2026-11-13");
});
test("planner fits dates and budget, including no availability and completed minutes", () => {
  const input = {
    today: "2026-11-12",
    days: [0, 1, 2, 3, 4, 5, 6],
    dailyMinutes: 25,
    targetDate: "2026-11-13",
    completed: { "2026-11-12": 15 },
    allocation: { review: 20, priority: 60, mixed: 20 },
    reviewMinutes: 10,
    priorityAvailable: true,
    mixedAvailable: true,
  };
  const slots = planSlots(input);
  expect(slots.reduce((n, s) => n + s.minutes, 0)).toBe(35);
  expect(slots.filter((s) => s.day > "2026-11-13")).toHaveLength(0);
  expect(planSlots({ ...input, days: [] })).toHaveLength(0);
  expect(planSlots({ ...input, dailyMinutes: 0 })).toHaveLength(0);
  expect(
    planSlots({ ...input, priorityAvailable: false, mixedAvailable: false, reviewMinutes: 0 }),
  ).toHaveLength(0);
});
test("consistency requires three strong sets, distinct items and topic coverage", () => {
  const sets = Array.from({ length: 3 }, (_, i) => ({
    accuracy: 0.85,
    questions: Array.from({ length: 10 }, (_, j) => `${i}-${j}`),
  }));
  expect(consistency(sets, true)).toBe("consistent practice performance");
  expect(consistency(sets, false)).toBe("needs more evidence");
  expect(
    consistency(
      sets.map((s) => ({ ...s, questions: ["repeat"] })),
      true,
    ),
  ).toBe("needs more evidence");
  const first = sets[0];
  if (!first) throw new Error("Missing set");
  expect(consistency([{ ...first, accuracy: 0.8 }, ...sets.slice(1)], true)).toBe("developing");
});
