"use client";
import type { ContentBlock, LessonStructure, SourceInput } from "@sibol-cse/api/learning-contracts";
import { Button } from "@sibol-cse/ui/components/button";
import { Input } from "@sibol-cse/ui/components/input";
import { Label } from "@sibol-cse/ui/components/label";
import { Textarea } from "@sibol-cse/ui/components/textarea";
import { SelectField } from "./learning-ui";
import { lessonSections } from "./lesson-content";
export const emptySource: SourceInput = {
  title: "",
  author: "",
  rights: "original",
  rightsStatement: "",
  url: null,
  references: [],
};
export function SourceEditor({
  value,
  onChange,
  prefix,
}: {
  value: SourceInput;
  onChange: (value: SourceInput) => void;
  prefix: string;
}) {
  return (
    <fieldset className="space-y-5 rounded-xl border p-5">
      <legend className="px-2 font-medium">Authorship & usage rights</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <Label htmlFor={`${prefix}-source-title`}>Source title</Label>
          <Input
            id={`${prefix}-source-title`}
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            required
            maxLength={200}
          />
        </div>
        <div className="field">
          <Label htmlFor={`${prefix}-author`}>Author / rights holder</Label>
          <Input
            id={`${prefix}-author`}
            value={value.author}
            onChange={(e) => onChange({ ...value, author: e.target.value })}
            required
            maxLength={200}
          />
        </div>
      </div>
      <SelectField
        id={`${prefix}-rights`}
        label="Permission basis"
        value={value.rights}
        options={[
          { value: "original", label: "Original work" },
          { value: "licensed", label: "Licensed content" },
          { value: "permitted", label: "Used with permission" },
        ]}
        onChange={(v) => onChange({ ...value, rights: v as SourceInput["rights"] })}
      />
      <div className="field">
        <Label htmlFor={`${prefix}-rights-statement`}>Authorship or permission statement</Label>
        <Textarea
          id={`${prefix}-rights-statement`}
          value={value.rightsStatement}
          onChange={(e) => onChange({ ...value, rightsStatement: e.target.value })}
          required
          maxLength={1000}
        />
        <p className="field-hint">
          No leaked or reconstructed confidential items. Retain evidence of permission where
          applicable.
        </p>
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-source-url`}>Source URL (optional, HTTPS)</Label>
        <Input
          id={`${prefix}-source-url`}
          type="url"
          value={value.url ?? ""}
          onChange={(e) => onChange({ ...value, url: e.target.value || null })}
        />
      </div>
      <div className="field">
        <Label htmlFor={`${prefix}-references`}>
          Reference URLs (one HTTPS URL per line, optional)
        </Label>
        <Textarea
          id={`${prefix}-references`}
          value={value.references.join("\n")}
          onChange={(e) =>
            onChange({ ...value, references: e.target.value.split("\n").filter(Boolean) })
          }
        />
      </div>
    </fieldset>
  );
}
function newBlock(type: ContentBlock["type"]): ContentBlock {
  if (type === "table") return { type, caption: "", headers: ["Heading"], rows: [["Cell"]] };
  if (type === "diagram") return { type, caption: "", steps: ["First step", "Next step"] };
  if (type === "media") return { type, src: "", alt: "" };
  return { type, text: "" };
}
export const blankStructure = (): LessonStructure => ({
  concept: [newBlock("text")],
  workedExample: [newBlock("text")],
  commonMistake: [newBlock("text")],
  technique: [newBlock("text")],
});
export function StructureEditor({
  value,
  onChange,
}: {
  value: LessonStructure;
  onChange: (value: LessonStructure) => void;
}) {
  function replace(key: keyof LessonStructure, index: number, block: ContentBlock) {
    onChange({ ...value, [key]: value[key].map((old, i) => (i === index ? block : old)) });
  }
  return (
    <div className="space-y-6">
      {lessonSections.map((section) => (
        <fieldset key={section.key} className="space-y-5 rounded-xl border p-5">
          <legend className="px-2 font-medium">{section.title}</legend>
          {value[section.key].map((block, index) => {
            const prefix = `${section.key}-${index}`;
            return (
              <div key={prefix} className="space-y-4 border-b pb-5">
                <SelectField
                  id={`${prefix}-type`}
                  label={`Block ${index + 1} format`}
                  value={block.type}
                  options={[
                    { value: "text", label: "Text / passage" },
                    { value: "math", label: "Math in readable text" },
                    { value: "table", label: "Table" },
                    { value: "diagram", label: "Step diagram" },
                    { value: "media", label: "Local image" },
                  ]}
                  onChange={(v) => replace(section.key, index, newBlock(v as ContentBlock["type"]))}
                />
                {(block.type === "text" || block.type === "math") && (
                  <div className="field">
                    <Label htmlFor={`${prefix}-text`}>{section.title} content</Label>
                    <Textarea
                      id={`${prefix}-text`}
                      value={block.text}
                      onChange={(e) =>
                        replace(section.key, index, { ...block, text: e.target.value })
                      }
                      required
                      maxLength={block.type === "math" ? 1000 : 12000}
                      rows={4}
                    />
                  </div>
                )}
                {(block.type === "table" || block.type === "diagram") && (
                  <div className="field">
                    <Label htmlFor={`${prefix}-caption`}>Caption</Label>
                    <Input
                      id={`${prefix}-caption`}
                      value={block.caption}
                      onChange={(e) =>
                        replace(section.key, index, { ...block, caption: e.target.value })
                      }
                      required
                    />
                  </div>
                )}
                {block.type === "table" && (
                  <>
                    <div className="field">
                      <Label htmlFor={`${prefix}-headers`}>Column headings (separate with |)</Label>
                      <Input
                        id={`${prefix}-headers`}
                        value={block.headers.join(" | ")}
                        onChange={(e) =>
                          replace(section.key, index, {
                            ...block,
                            headers: e.target.value.split("|").map((v) => v.trim()),
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <Label htmlFor={`${prefix}-rows`}>
                        Rows (one per line, separate cells with |)
                      </Label>
                      <Textarea
                        id={`${prefix}-rows`}
                        value={block.rows.map((r) => r.join(" | ")).join("\n")}
                        onChange={(e) =>
                          replace(section.key, index, {
                            ...block,
                            rows: e.target.value
                              .split("\n")
                              .map((row) => row.split("|").map((v) => v.trim())),
                          })
                        }
                      />
                    </div>
                  </>
                )}
                {block.type === "diagram" && (
                  <div className="field">
                    <Label htmlFor={`${prefix}-steps`}>Steps (one per line)</Label>
                    <Textarea
                      id={`${prefix}-steps`}
                      value={block.steps.join("\n")}
                      onChange={(e) =>
                        replace(section.key, index, { ...block, steps: e.target.value.split("\n") })
                      }
                    />
                  </div>
                )}
                {block.type === "media" && (
                  <>
                    <div className="field">
                      <Label htmlFor={`${prefix}-src`}>Local image path</Label>
                      <Input
                        id={`${prefix}-src`}
                        placeholder="/media/example.webp"
                        value={block.src}
                        onChange={(e) =>
                          replace(section.key, index, { ...block, src: e.target.value })
                        }
                      />
                      <p className="field-hint">
                        Use an already deployed PNG, JPEG or WebP under /media/. External URLs and
                        executable SVGs are not accepted.
                      </p>
                    </div>
                    <div className="field">
                      <Label htmlFor={`${prefix}-alt`}>Image description</Label>
                      <Textarea
                        id={`${prefix}-alt`}
                        value={block.alt}
                        onChange={(e) =>
                          replace(section.key, index, { ...block, alt: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
                {value[section.key].length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onChange({
                        ...value,
                        [section.key]: value[section.key].filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove block {index + 1} from {section.title}
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            disabled={value[section.key].length >= 20}
            onClick={() =>
              onChange({ ...value, [section.key]: [...value[section.key], newBlock("text")] })
            }
          >
            Add block to {section.title}
          </Button>
        </fieldset>
      ))}
    </div>
  );
}
