import type { ContentBlock, LessonStructure } from "@sibol-cse/api/learning-contracts";
import Image from "next/image";
export const lessonSections = [
  { key: "concept", title: "The concept" },
  { key: "workedExample", title: "Worked example" },
  { key: "commonMistake", title: "Common mistake" },
  { key: "technique", title: "A useful technique" },
] as const;
export function Block({ block }: { block: ContentBlock }) {
  if (block.type === "text") return <p className="whitespace-pre-wrap">{block.text}</p>;
  if (block.type === "math")
    return (
      <p className="rounded-md bg-muted p-4 font-medium whitespace-pre-wrap tabular-nums">
        {block.text}
      </p>
    );
  if (block.type === "diagram")
    return (
      <figure>
        <figcaption className="mb-3 font-medium">{block.caption}</figcaption>
        <ol className="list-inside list-decimal space-y-2 border-l-2 border-primary pl-4">
          {block.steps.map((step, i) => (
            <li key={`${i}-${step}`}>{step}</li>
          ))}
        </ol>
      </figure>
    );
  if (block.type === "media")
    return (
      <figure>
        <Image
          width={800}
          height={480}
          src={block.src}
          alt={block.alt}
          loading="lazy"
          className="h-auto max-h-96 max-w-full rounded-xl object-contain"
        />
        <figcaption className="mt-2 text-sm text-muted-foreground">{block.alt}</figcaption>
      </figure>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="mb-3 text-left text-sm text-muted-foreground">{block.caption}</caption>
        <thead>
          <tr className="border-b">
            {block.headers.map((head, i) => (
              <th key={`${i}-${head}`} scope="col" className="p-3">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={row.join("|") + i} className="border-b">
              {row.map((cell, j) => (
                <td key={`${i}-${j}`} className="p-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function LessonBody({ structure }: { structure: LessonStructure }) {
  return (
    <div className="reading space-y-10">
      {lessonSections.map((section) => (
        <section id={section.key} key={section.key} className="scroll-mt-6">
          <h2 className="mb-5">{section.title}</h2>
          <div className="space-y-5">
            {structure[section.key].map((block, i) => (
              <Block key={`${section.key}-${i}`} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
