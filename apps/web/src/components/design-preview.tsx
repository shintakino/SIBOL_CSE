"use client";
import { Badge } from "@sibol-cse/ui/components/badge";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@sibol-cse/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sibol-cse/ui/components/dialog";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { Progress } from "@sibol-cse/ui/components/progress";
import { RadioGroup, RadioGroupItem } from "@sibol-cse/ui/components/radio-group";
import { Skeleton } from "@sibol-cse/ui/components/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CloudOff,
  Flag,
  Info,
  LoaderCircle,
  Sprout,
} from "lucide-react";
import { useState } from "react";

const states = [
  {
    icon: LoaderCircle,
    title: "Saving…",
    detail: "Waiting for the server to acknowledge your answer.",
  },
  { icon: CheckCircle2, title: "Saved", detail: "The server has acknowledged your answer." },
  {
    icon: CloudOff,
    title: "Save failed",
    detail: "This change is not saved. Check your connection and retry.",
  },
  {
    icon: Clock3,
    title: "Expired",
    detail: "Time has ended. Answers arriving after the deadline cannot be accepted.",
  },
  {
    icon: Info,
    title: "Insufficient evidence",
    detail: "More first-exposure answers are needed to describe your performance.",
  },
  {
    icon: AlertCircle,
    title: "Content shortage",
    detail: "There aren’t enough reviewed items for this set. Choose another topic.",
  },
];
export function DesignPreview() {
  const [answer, setAnswer] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [retry, setRetry] = useState(false);
  return (
    <div className="space-y-8">
      <div className="study-grid">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary">Question player preview</Badge>
              <span className="status-row tabular-nums">
                <Clock3 className="size-4" aria-hidden="true" />
                <span>
                  <span className="sr-only">Example time remaining: </span>12:00
                </span>
              </span>
            </div>
            <CardTitle>
              <h2>A little practice in reasoning</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Sample item · Selection does not indicate correctness. Answers are not recorded.
            </p>
            <Progress value={20} aria-label="Example question progress: 1 of 5" />
            <p id="sample-question" className="reading">
              A community garden has 24 seedlings. If ¾ of them are planted, how many seedlings are
              still waiting to be planted?
            </p>
            <RadioGroup
              value={answer}
              onValueChange={(value) => setAnswer(String(value))}
              aria-labelledby="sample-question"
            >
              {["4 seedlings", "6 seedlings", "8 seedlings", "18 seedlings"].map((text, i) => (
                <Label htmlFor={`choice-${i}`} key={text} className="answer-option">
                  <RadioGroupItem id={`choice-${i}`} value={String(i)} />
                  <span>{text}</span>
                </Label>
              ))}
            </RadioGroup>
            <div className="flex flex-wrap justify-between gap-3">
              <Button variant="outline" aria-pressed={flagged} onClick={() => setFlagged(!flagged)}>
                <Flag aria-hidden="true" />
                {flagged ? "Flagged for review" : "Flag for review"}
              </Button>
              <Dialog>
                <DialogTrigger render={<Button disabled={!answer} />}>
                  Review selection
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Review your selection</DialogTitle>
                    <DialogDescription>
                      This is a component preview. Your choice is not submitted, saved, or scored.
                    </DialogDescription>
                  </DialogHeader>
                  <p>
                    Selected:{" "}
                    {["4 seedlings", "6 seedlings", "8 seedlings", "18 seedlings"][Number(answer)]}
                  </p>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      Back to question
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <p className="text-sm text-muted-foreground">
              Timers will announce meaningful milestones, rather than every second.
            </p>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Controls, with breathing room</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="field">
                <Label htmlFor="example-field">A labeled field</Label>
                <Input id="example-field" placeholder="Your next small step" />
              </div>
              <div className="field">
                <Label htmlFor="example-error">Error example</Label>
                <Input
                  id="example-error"
                  aria-invalid="true"
                  aria-describedby="example-error-description"
                  defaultValue=""
                />
                <p id="example-error-description" className="status-row text-destructive">
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  Choose a study day to continue.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button disabled>Unavailable</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>Selected</Badge>
                <Badge variant="secondary">New</Badge>
                <Badge variant="outline">Not yet answered</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <Sprout className="size-8 text-primary" aria-hidden="true" />
              <h2>A fresh notebook.</h2>
              <p className="text-muted-foreground">
                No saved resources yet. Your bookmarks will have a home here.
              </p>
              <div role="status" aria-label="Loading content example" className="space-y-2 pt-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <span className="sr-only">Loading example</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <section aria-labelledby="states-title">
        <h2 id="states-title" className="mb-4">
          Clear, honest states
        </h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Preview labels for real server outcomes. None describe a live attempt.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {states.map(({ icon: Icon, title, detail }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <div className="status-row mb-2 font-medium">
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {title}
              </div>
              <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setRetry(true)}>
            Retry example
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {retry
              ? "Retry action received. No live answer was saved."
              : "A failed request always offers a next step."}
          </p>
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Room for language, passages, and numbers</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p lang="fil" className="reading">
            Ang pagkatuto ay unti-unting paglago. Basahin ang talata nang maingat, pagkatapos ay
            piliin ang sagot na pinakamalapit sa pangunahing ideya.
          </p>
          <p className="reading mt-4">
            A ratio can be written as 3 : 4. For a group of 24, ¾ × 24 = 18. Keep every step
            readable at your preferred text size.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full max-w-lg text-left">
              <caption className="mb-3 text-left text-sm text-muted-foreground">
                Example table · not your personal schedule
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-3">
                    Activity
                  </th>
                  <th scope="col" className="p-3">
                    Minutes
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <th scope="row" className="p-3 font-normal">
                    Read a worked example
                  </th>
                  <td className="p-3 tabular-nums">10</td>
                </tr>
                <tr>
                  <th scope="row" className="p-3 font-normal">
                    Recall the key idea
                  </th>
                  <td className="p-3 tabular-nums">5</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
