"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Label } from "@sibol-cse/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sibol-cse/ui/components/select";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormError } from "./feedback";
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "We couldn’t complete this request. Please retry.";
export function useData<T>(load: () => Promise<T>) {
  const generation = useRef(0);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await load();
      if (request === generation.current) setData(result);
    } catch (e) {
      if (request === generation.current) setError(errorMessage(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  return { data, error, loading, reload, setData, setError };
}
export function LoadState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && (
        <p role="status" className="text-muted-foreground">
          Loading your study space…
        </p>
      )}
      <FormError message={error} />
      {error && (
        <Button variant="outline" onClick={reload}>
          Retry
        </Button>
      )}
    </>
  );
}
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        items={options}
        onValueChange={(v) => {
          if (typeof v === "string") onChange(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
