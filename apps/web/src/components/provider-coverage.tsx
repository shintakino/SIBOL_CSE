"use client";
import { areaLabels, providerArea } from "@sibol-cse/api/study-catalog";
import { Button, buttonVariants } from "@sibol-cse/ui/components/button";
import { Card, CardContent, CardHeader } from "@sibol-cse/ui/components/card";
import Link from "next/link";
import { useCallback, useState } from "react";
import { client } from "@/utils/orpc";
import { LoadState, SelectField, useData } from "./learning-ui";
import { StudyImage } from "./study-image";

function SourceRecord({
  bankId,
  sourceKey,
  subcategory,
}: {
  bankId: string;
  sourceKey: string;
  subcategory: string;
}) {
  const load = useCallback(
    () => client.content.sourceRecord({ bankId, sourceKey, subcategory }),
    [bankId, sourceKey, subcategory],
  );
  const state = useData(load),
    record = state.data;
  return (
    <div className="space-y-4 rounded-xl bg-secondary p-4">
      <LoadState {...state} />
      {record && (
        <>
          <p className="text-sm font-medium">
            Preserved provider record · {record.kind} · unreviewed
          </p>
          {record.instruction && <p>{record.instruction}</p>}
          {record.passage && (
            <blockquote className="whitespace-pre-wrap border-l-2 pl-4">
              {record.passage}
            </blockquote>
          )}
          {record.media && <StudyImage media={record.media} />}
          <p className="whitespace-pre-wrap">{record.prompt}</p>
          {record.highlight && <p>Referenced text: {record.highlight}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {record.choices.map((choice) => (
              <div key={choice.id} className="space-y-3 rounded-lg border bg-card p-4">
                <p>
                  {choice.id.toUpperCase()}. {choice.text}
                </p>
                {choice.media && <StudyImage media={choice.media} compact />}
              </div>
            ))}
          </div>
          {record.orderItems.length > 0 && (
            <ul className="space-y-3">
              {record.orderItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.id}.</strong> {item.text}
                </li>
              ))}
            </ul>
          )}
          <p>
            Provider key (unreviewed): <code>{record.providerKey}</code>
          </p>
          <p className="whitespace-pre-wrap">
            {record.explanation ||
              "No explanation supplied. Author and review one before this item becomes playable."}
          </p>
        </>
      )}
    </div>
  );
}
function Sources({ bankId, subcategory }: { bankId: string; subcategory: string }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(
    () => client.content.sources({ bankId, subcategory, page }),
    [bankId, subcategory, page],
  );
  const state = useData(load);
  return (
    <div className="space-y-4 border-t pt-4">
      <LoadState {...state} />
      {state.data?.items.map((item) => (
        <article key={item.key} className="space-y-3 rounded-lg border p-4">
          <p className="whitespace-pre-wrap">{item.prompt}</p>
          <p className="text-sm text-muted-foreground">
            Study topic: {item.topicTitle ?? "Unmapped — outside scope or needs classification"}
          </p>
          {item.heldReasons.length > 0 && (
            <ul className="list-inside list-disc text-sm">
              {item.heldReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(selected === item.key ? null : item.key)}
          >
            View preserved source and images
          </Button>
          {selected === item.key && (
            <SourceRecord bankId={bankId} sourceKey={item.key} subcategory={subcategory} />
          )}
          {item.externalId && (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/admin/content?query=${encodeURIComponent(item.externalId)}`}
            >
              Review native draft
            </Link>
          )}
          {!item.externalId && (
            <p className="text-sm text-muted-foreground">
              Retained in the private source snapshot. Resolve its hold before importing a playable
              draft.
            </p>
          )}
        </article>
      ))}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={page === 0 || state.loading}
          onClick={() => setPage(page - 1)}
        >
          Previous source page
        </Button>
        <Button
          variant="outline"
          disabled={!state.data?.hasMore || state.loading}
          onClick={() => setPage(page + 1)}
        >
          Next source page
        </Button>
      </div>
    </div>
  );
}
export function ProviderCoverage() {
  const [level, setLevel] = useState<"professional" | "subprofessional">("professional");
  const [expanded, setExpanded] = useState<string | null>(null);
  const load = useCallback(() => client.content.coverage({ level }), [level]);
  const state = useData(load),
    data = state.data;
  return (
    <div className="space-y-6">
      <SelectField
        id="coverage-track"
        label="Coverage track"
        value={level}
        options={[
          { value: "professional", label: "Professional" },
          { value: "subprofessional", label: "Subprofessional" },
        ]}
        onChange={(value) => {
          setLevel(value as typeof level);
          setExpanded(null);
        }}
      />
      <LoadState {...state} />
      {data && (
        <>
          <div role="note" className="space-y-2 rounded-xl border bg-secondary p-5">
            <p className="font-medium">
              {data.bank?.coverageVerified
                ? "Source IDs reconciled against an authoritative manifest"
                : "Sampled coverage · provider total unknown"}
            </p>
            <p>
              {data.bank
                ? "Collected source IDs are counted separately from playable native questions. Shared questions serve both tracks. Drafts and held items are unavailable to learners."
                : "No provider snapshot has been synchronized yet."}
            </p>
            <p className="text-sm">
              A topic returning no new samples does not establish a complete bank. Full mock
              readiness still requires reviewed content, lessons and valid forms.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[...new Set(data.topics.map((t) => t.category))].map((category) => (
              <Card key={category}>
                <CardHeader>
                  <h2>
                    {areaLabels[providerArea[category as keyof typeof providerArea]] ?? category}
                  </h2>
                </CardHeader>
                <CardContent className="space-y-5">
                  {data.topics
                    .filter((t) => t.category === category)
                    .map((topic) => (
                      <section key={topic.subcategory} className="space-y-3 border-t pt-4">
                        <h3>{topic.label}</h3>
                        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                          {[
                            ["Collected source IDs", topic.collected],
                            ["Mapped sources", topic.mapped],
                            ["Native drafts", topic.drafts],
                            ["Published and eligible", topic.published],
                            ["Additional source holds", topic.held],
                            ["Expected source IDs", topic.expected ?? "Unknown"],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt className="text-muted-foreground">{label}</dt>
                              <dd className="text-lg font-medium tabular-nums">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        {data.bank && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setExpanded(expanded === topic.subcategory ? null : topic.subcategory)
                            }
                          >
                            {expanded === topic.subcategory
                              ? "Hide source audit"
                              : "Inspect source classifications"}
                          </Button>
                        )}
                        {data.bank && expanded === topic.subcategory && (
                          <Sources
                            key={`${data.bank.id}-${topic.subcategory}`}
                            bankId={data.bank.id}
                            subcategory={topic.subcategory}
                          />
                        )}
                      </section>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
