"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { ArrowDown, ArrowUp } from "lucide-react";

export function OrderedAnswer({
  items,
  value,
  disabled,
  onChange,
}: {
  items: { id: string; text: string; label?: string }[];
  value: string[] | null;
  disabled: boolean;
  onChange: (order: string[]) => void;
}) {
  const order = value ?? items.map((i) => i.id);
  function move(index: number, delta: number) {
    const next = [...order];
    const from = next[index],
      to = next[index + delta];
    if (!from || !to) return;
    next[index] = to;
    next[index + delta] = from;
    onChange(next);
  }
  return (
    <section className="space-y-4" aria-label="Arrange your answer">
      <p className="text-sm text-muted-foreground">
        Move each item into order. Each move saves the complete sequence. To keep the initial order,
        select Save this order.
      </p>
      <ol className="space-y-3">
        {order.map((id, index) => (
          <li key={id} className="flex items-start gap-3 rounded-xl border p-4">
            <span className="pt-2 text-sm font-medium tabular-nums">
              {items.find((item) => item.id === id)?.label ?? index + 1}.
            </span>
            <p className="flex-1 whitespace-pre-wrap pt-2">
              {items.find((i) => i.id === id)?.text}
            </p>
            <span className="flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11"
                disabled={disabled || index === 0}
                aria-label={`Move item ${index + 1} up`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11"
                disabled={disabled || index === order.length - 1}
                aria-label={`Move item ${index + 1} down`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      {!value && (
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange(order)}>
          Save this order
        </Button>
      )}
    </section>
  );
}
