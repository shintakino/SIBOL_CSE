"use client";
import type { areaLabels } from "@sibol-cse/api/study-catalog";
import { Button } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import { ArrowRight, BookOpen, Calculator, GitBranch, Landmark, ListOrdered } from "lucide-react";
import type { client } from "@/utils/orpc";
import { SelectField } from "./learning-ui";

export type Catalog = Awaited<ReturnType<typeof client.topics.catalog>>;
export type StudySelection = {
  area: "all" | keyof typeof areaLabels;
  topicId: string;
  providerSubcategory: string | null;
};
export const allSubjects: StudySelection = {
  area: "all",
  topicId: "mixed",
  providerSubcategory: null,
};
const icons = {
  verbal: BookOpen,
  numerical: Calculator,
  analytical: GitBranch,
  general: Landmark,
  clerical: ListOrdered,
};
export function StudyCatalogCards({
  catalog,
  onSelect,
}: {
  catalog: Catalog;
  onSelect: (value: StudySelection) => void;
}) {
  return (
    <section className="space-y-5" aria-labelledby="study-subject-heading">
      <div>
        <h2 id="study-subject-heading">Study by category</h2>
        <p className="mt-2 text-muted-foreground">
          Showing {catalog.level === "professional" ? "Professional" : "Subprofessional"} subjects.
          Counts include published questions available for study.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {catalog.areas.map((area) => {
          const Icon = icons[area.id as keyof typeof icons] ?? BookOpen;
          return (
            <Card key={area.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-secondary p-3 text-primary">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{area.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {area.count} published questions
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {area.topics.map((topic) => (
                    <li key={topic.id}>
                      <Button
                        variant="secondary"
                        className="h-auto min-h-12 w-full justify-between gap-3 whitespace-normal py-3 text-left"
                        onClick={() =>
                          onSelect({
                            area: area.id as StudySelection["area"],
                            topicId: topic.id,
                            providerSubcategory: null,
                          })
                        }
                      >
                        <span>{topic.label}</span>
                        <span className="flex shrink-0 items-center gap-2 text-sm">
                          {topic.count}
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </span>
                      </Button>
                      {topic.focuses.length > 1 && (
                        <ul className="ml-4 mt-2 space-y-1 border-l pl-3">
                          {topic.focuses.map((focus) => (
                            <li key={focus.id}>
                              <Button
                                variant="ghost"
                                className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal text-left"
                                onClick={() =>
                                  onSelect({
                                    area: area.id as StudySelection["area"],
                                    topicId: topic.id,
                                    providerSubcategory: focus.id,
                                  })
                                }
                              >
                                <span>{focus.label}</span>
                                <span className="text-sm tabular-nums">{focus.count}</span>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {topic.count === 0 && (
                        <p className="px-3 pt-1 text-sm text-muted-foreground">
                          Awaiting reviewed content
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
export function selectionAvailability(catalog: Catalog, value: StudySelection): number {
  const topics = catalog.areas
    .filter((a) => value.area === "all" || a.id === value.area)
    .flatMap((a) => a.topics);
  if (value.topicId === "mixed") return topics.reduce((n, t) => n + t.count, 0);
  const selected = topics.find((t) => t.id === value.topicId);
  return value.providerSubcategory
    ? (selected?.focuses.find((f) => f.id === value.providerSubcategory)?.count ?? 0)
    : (selected?.count ?? 0);
}
export function StudyFilters({
  catalog,
  value,
  onChange,
  prefix = "study",
}: {
  catalog: Catalog;
  value: StudySelection;
  onChange: (value: StudySelection) => void;
  prefix?: string;
}) {
  const topics = catalog.areas
    .filter((a) => value.area === "all" || a.id === value.area)
    .flatMap((a) => a.topics);
  const selected = topics.find((t) => t.id === value.topicId);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <SelectField
        id={`${prefix}-category`}
        label="Category"
        value={value.area}
        options={[
          { value: "all", label: "All categories" },
          ...catalog.areas.map((a) => ({ value: a.id, label: a.label })),
        ]}
        onChange={(area) =>
          onChange({
            area: area as StudySelection["area"],
            topicId: "mixed",
            providerSubcategory: null,
          })
        }
      />
      <SelectField
        id={`${prefix}-topic`}
        label="Topic"
        value={value.topicId}
        options={[
          {
            value: "mixed",
            label:
              value.area === "all"
                ? "Mixed retrieval · all enabled topics"
                : "All subcategories in this category",
          },
          ...topics.map((t) => ({ value: t.id, label: t.label })),
        ]}
        onChange={(topicId) => onChange({ ...value, topicId, providerSubcategory: null })}
      />
      {selected && selected.focuses.length > 1 && (
        <SelectField
          id={`${prefix}-focus`}
          label="Source subcategory (optional)"
          value={value.providerSubcategory ?? "all"}
          options={[
            { value: "all", label: "All reviewed questions for this topic" },
            ...selected.focuses.map((f) => ({
              value: f.id,
              label: `${f.label} · ${f.count} questions`,
            })),
          ]}
          onChange={(id) => onChange({ ...value, providerSubcategory: id === "all" ? null : id })}
        />
      )}
    </div>
  );
}
