// Pure calendar and evidence policies. All clocks passed here come from the server.
export function studyDate(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function monday(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
export function reviewTransition(input: {
  today: string;
  dueOn: string;
  step: number;
  lastReviewedOn: string | null;
  outcome: "correct" | "incorrect" | "skipped" | "guessed" | "tomorrow";
}) {
  if (input.outcome !== "correct")
    return { step: 0, dueOn: addDays(input.today, 1), lastReviewedOn: input.today };
  if (input.lastReviewedOn === input.today || input.dueOn > input.today)
    return { step: input.step, dueOn: input.dueOn, lastReviewedOn: input.lastReviewedOn };
  const intervals = [3, 7, 14, 30];
  return {
    step: Math.min(4, input.step + 1),
    dueOn: addDays(input.today, intervals[Math.min(3, input.step)] ?? 30),
    lastReviewedOn: input.today,
  };
}
export type Allocation = { review: number; priority: number; mixed: number };
export type PlannedSlot = { day: string; minutes: number; kind: "review" | "priority" | "mixed" };
export function planSlots(input: {
  today: string;
  days: number[];
  dailyMinutes: number;
  targetDate: string | null;
  completed: Record<string, number>;
  allocation: Allocation;
  reviewMinutes: number;
  priorityAvailable: boolean;
  mixedAvailable: boolean;
}) {
  const end = addDays(monday(input.today), 6);
  const result: PlannedSlot[] = [];
  const assigned = { review: 0, priority: 0, mixed: 0 };
  for (let day = input.today; day <= end; day = addDays(day, 1)) {
    if (input.targetDate && day > input.targetDate) break;
    if (!input.days.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
    const budget = Math.max(0, input.dailyMinutes - (input.completed[day] ?? 0));
    for (let m = 0; m + 5 <= budget; m += 5) {
      const total = assigned.review + assigned.priority + assigned.mixed + 5;
      const eligible = (["review", "priority", "mixed"] as const).filter(
        (kind) =>
          input.allocation[kind] > 0 &&
          (kind === "review"
            ? assigned.review < input.reviewMinutes
            : kind === "priority"
              ? input.priorityAvailable
              : input.mixedAvailable),
      );
      const kind = eligible.sort(
        (a, b) =>
          (input.allocation[b] * total) / 100 -
          assigned[b] -
          ((input.allocation[a] * total) / 100 - assigned[a]),
      )[0];
      if (!kind) break;
      assigned[kind] += 5;
      result.push({ day, minutes: 5, kind });
    }
  }
  return result;
}
export function consistency(sets: { accuracy: number; questions: string[] }[], covered: boolean) {
  const last = sets.slice(0, 3);
  if (last.length < 3 || new Set(last.flatMap((s) => s.questions)).size < 30 || !covered)
    return "needs more evidence";
  return last.every((s) => s.accuracy >= 0.85) ? "consistent practice performance" : "developing";
}
