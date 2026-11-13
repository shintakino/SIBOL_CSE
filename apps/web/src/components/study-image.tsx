"use client";
import type { QuestionMedia } from "@sibol-cse/api/learning-contracts";
import { Button } from "@sibol-cse/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sibol-cse/ui/components/dialog";
import { ZoomIn } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function ImageZoom({
  media,
  label = "Enlarge image",
}: {
  media: QuestionMedia;
  label?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" className="min-h-11" />}
      >
        <ZoomIn aria-hidden="true" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Image detail</DialogTitle>
          <DialogDescription>Enlarged view. Close to return to the question.</DialogDescription>
        </DialogHeader>
        <Image
          src={media.src}
          alt={media.alt}
          width={media.width ?? 800}
          height={media.height ?? 480}
          unoptimized={media.src.startsWith("/api/content-media/")}
          className="mx-auto h-auto max-h-[72dvh] max-w-full object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
export function StudyImage({
  media,
  zoom = true,
  compact = false,
}: {
  media: QuestionMedia;
  zoom?: boolean;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="block space-y-2">
      {failed ? (
        <span role="alert" className="block rounded-lg border p-4 text-sm">
          The image could not be loaded. Description: {media.alt} Reload to try the image again.
        </span>
      ) : (
        <Image
          src={media.src}
          alt={media.alt}
          width={media.width ?? 800}
          height={media.height ?? 480}
          unoptimized={media.src.startsWith("/api/content-media/")}
          onError={() => setFailed(true)}
          className={`mx-auto h-auto w-full object-contain ${compact ? "max-h-44" : "max-h-[28rem]"}`}
        />
      )}
      {zoom && !failed && (
        <span className="flex justify-end">
          <ImageZoom media={media} />
        </span>
      )}
    </span>
  );
}
