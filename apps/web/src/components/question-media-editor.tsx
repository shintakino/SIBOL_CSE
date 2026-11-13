"use client";
import type { QuestionMedia } from "@sibol-cse/api/learning-contracts";
import { Button } from "@sibol-cse/ui/components/button";
import { Checkbox } from "@sibol-cse/ui/components/checkbox";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { useState } from "react";
import { client } from "@/utils/orpc";
import { FormError } from "./feedback";
import { errorMessage } from "./learning-ui";
import { StudyImage } from "./study-image";

export function QuestionMediaEditor({
  id,
  value,
  onChange,
  onBusyChange,
}: {
  id: string;
  value: QuestionMedia | null;
  onChange: (value: QuestionMedia | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      if (
        file.size > 5 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error("Choose a PNG, JPEG or WebP up to 5 MiB.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result.split(",")[1] ?? "")
            : reject(new Error("Unable to read image."));
        reader.onerror = () => reject(new Error("Unable to read image."));
        reader.readAsDataURL(file);
      });
      const image = await client.content.putAsset({
        mime: file.type as "image/png" | "image/jpeg" | "image/webp",
        dataBase64: data,
      });
      onChange({
        src: image.src,
        alt: "",
        descriptionReviewed: false,
        width: image.width,
        height: image.height,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="px-2 text-sm font-medium">Image (optional)</legend>
      <div className="field">
        <Label htmlFor={`${id}-upload`}>Upload a private study image</Label>
        <Input
          id={`${id}-upload`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {busy && <p role="status">Uploading image…</p>}
      {value && (
        <>
          <div className="field">
            <Label htmlFor={`${id}-alt`}>Image description for learners</Label>
            <Input
              id={`${id}-alt`}
              value={value.alt}
              maxLength={300}
              onChange={(e) =>
                onChange({ ...value, alt: e.target.value, descriptionReviewed: false })
              }
            />
            <p className="text-sm text-muted-foreground">
              Describe the chart or relationships needed to answer, without marking the correct
              choice.
            </p>
          </div>
          <Label htmlFor={`${id}-reviewed`} className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={`${id}-reviewed`}
              checked={value.descriptionReviewed === true}
              disabled={!value.alt.trim() || /pending.*review|review.*pending/i.test(value.alt)}
              onCheckedChange={(v) => onChange({ ...value, descriptionReviewed: !!v })}
            />
            I reviewed this image description.
          </Label>
          <StudyImage media={value} compact />
          <Button type="button" variant="outline" onClick={() => onChange(null)}>
            Remove image
          </Button>
        </>
      )}
      <FormError message={error} />
    </fieldset>
  );
}
