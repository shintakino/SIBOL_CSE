type Response = { selectedChoiceId?: string | null; selectedOrder?: string[] | null };
type Key = { kind?: string; answerChoiceId: string | null; answerOrder?: string[] | null };

export function validOrder(value: string[], pinned: string[]): boolean {
  return (
    value.length === pinned.length &&
    new Set(value).size === value.length &&
    value.every((id) => pinned.includes(id))
  );
}
export function hasResponse(response: Response | undefined): boolean {
  return !!response?.selectedChoiceId || !!response?.selectedOrder?.length;
}
export function sameOrder(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  return a == null || b == null
    ? a == null && b == null
    : a.length === b.length && a.every((id, i) => id === b[i]);
}
export function isCorrectResponse(key: Key, response: Response | undefined): boolean {
  if (key.kind === "order")
    return !!key.answerOrder?.length && sameOrder(response?.selectedOrder, key.answerOrder);
  return (
    typeof key.answerChoiceId === "string" && response?.selectedChoiceId === key.answerChoiceId
  );
}
