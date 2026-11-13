import { expect, test } from "bun:test";
import {
  hasResponse,
  isCorrectResponse,
  validOrder,
} from "@sibol-cse/api/services/question-response";

test("ordered responses require every pinned ID once and preserve significant answer order", () => {
  expect(validOrder(["c", "a", "b"], ["a", "b", "c"])).toBe(true);
  for (const value of [
    ["a", "a", "c"],
    ["a", "b"],
    ["a", "b", "foreign"],
  ])
    expect(validOrder(value, ["a", "b", "c"])).toBe(false);
  const version = { kind: "order", answerChoiceId: null, answerOrder: ["b", "a", "c"] };
  expect(
    isCorrectResponse(version, { selectedChoiceId: null, selectedOrder: ["b", "a", "c"] }),
  ).toBe(true);
  expect(
    isCorrectResponse(version, { selectedChoiceId: null, selectedOrder: ["a", "b", "c"] }),
  ).toBe(false);
  expect(isCorrectResponse(version, undefined)).toBe(false);
  expect(hasResponse({ selectedChoiceId: null, selectedOrder: ["b", "a", "c"] })).toBe(true);
  expect(hasResponse({ selectedChoiceId: null, selectedOrder: null })).toBe(false);
});
test("choice and error responses cannot earn credit from a null or mismatched key", () => {
  for (const kind of ["choice", "error"]) {
    expect(isCorrectResponse({ kind, answerChoiceId: "b" }, { selectedChoiceId: "b" })).toBe(true);
    expect(isCorrectResponse({ kind, answerChoiceId: "b" }, { selectedChoiceId: "a" })).toBe(false);
    expect(isCorrectResponse({ kind, answerChoiceId: null }, { selectedChoiceId: null })).toBe(
      false,
    );
  }
});
