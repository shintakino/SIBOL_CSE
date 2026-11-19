"use client";
import { Button } from "@sibol-cse/ui/components/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { useReviewer } from "./shell";
import { conceptCards, formulaCards } from "./study-guide";

type StartInput = Parameters<ReturnType<typeof useReviewer>["start"]>[0];
export function LaunchCard({
  icon,
  title,
  description,
  footer,
  tag,
  featured = false,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  footer: string;
  tag?: string;
  featured?: boolean;
  onClick: () => void;
}) {
  const { busy } = useReviewer();
  return (
    <Button
      variant="ghost"
      className={`action-card ${featured ? "featured" : ""}`}
      disabled={busy}
      onClick={onClick}
      aria-label={footer}
    >
      {tag && (
        <span className={`card-tag ${tag === "Practice Sim" ? "simulator-tag" : ""}`}>{tag}</span>
      )}
      <span className="card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="card-title">{title}</span>
      <span className="card-desc">{description}</span>
      <span className="card-footer">
        <span>{busy ? "Loading quiz…" : footer}</span>
        <span aria-hidden="true">➔</span>
      </span>
    </Button>
  );
}
export function Stat({
  icon,
  value,
  label,
  onClick,
}: {
  icon: string;
  value: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={`stat-icon-wrap ${icon === "❌" ? "danger-icon" : icon === "⭐" ? "accent-icon" : ""}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span>
        <span className="stat-value block">{value}</span>
        <span className="stat-label block">{label}</span>
      </span>
    </>
  );
  return onClick ? (
    <Button variant="ghost" className="stat-box" onClick={onClick}>
      {body}
    </Button>
  ) : (
    <div className="stat-box">{body}</div>
  );
}
function Loading() {
  return (
    <p role="status" className="status-message">
      Loading your CSE question bank…
    </p>
  );
}
function DomainGrid() {
  const { data, start } = useReviewer();
  return (
    <div className="dashboard-grid">
      {data?.catalog.areas.map((area) => (
        <LaunchCard
          key={area.id}
          icon="📂"
          title={area.label}
          description={`${area.count} published questions · ${area.topics.length} topics`}
          footer={`Practice ${area.label}`}
          onClick={() => void start({ mode: "topic", area: area.id as StartInput["area"] })}
        />
      ))}
    </div>
  );
}
export function ReviewerDashboard() {
  const { data, start, mock } = useReviewer();
  if (!data) return <Loading />;
  return (
    <>
      <h1 className="sr-only">CSE Exam Prep Dashboard</h1>
      <section className="stats-strip" aria-label="Your study statistics">
        <Stat icon="📝" value={data.examsTaken} label="Exams Taken" />
        <Stat
          icon="🎯"
          value={data.averageScore == null ? "—" : `${data.averageScore}%`}
          label="Average Score"
        />
        <Stat
          icon="❌"
          value={data.missedCount ?? "—"}
          label="Missed Questions Vault"
          onClick={() => void start({ mode: "missed" })}
        />
        <Stat
          icon="⭐"
          value={data.bookmarkCount ?? "—"}
          label="Bookmarked Questions"
          onClick={() => void start({ mode: "bookmarks" })}
        />
      </section>
      <div className="dashboard-grid">
        <LaunchCard
          icon="📅"
          title="Daily Randomized Challenge"
          tag="Daily Practice"
          featured
          description="25 newly shuffled CSE questions. Instant explanations after every pick to build exam momentum!"
          footer="Start Today's Quiz (25 Qs)"
          onClick={() => void start({ mode: "daily" })}
        />
        <LaunchCard
          icon="⏱️"
          title="Full Practice Mock (50 Qs)"
          tag="Practice Sim"
          description="Timed CSE practice simulation. Question palette, flag for review, and complete score breakdown at the end."
          footer="Launch Simulator (50 Qs)"
          onClick={() => void mock(50)}
        />
        <LaunchCard
          icon="⚡"
          title="Quick 10 Sprint"
          description="Quick 10-question randomized sprint. Perfect for a short study session between breaks!"
          footer="Start 10 Qs Sprint"
          onClick={() => void start({ mode: "quick10" })}
        />
        <LaunchCard
          icon="🎯"
          title="Weakness Radar Drill"
          description="Practice the questions you previously missed. Review the explanation and try again until the concept clicks."
          footer="Review Missed Qs"
          onClick={() => void start({ mode: "missed" })}
        />
      </div>
      <h2 className="section-title">Explore by CSE Knowledge Domain</h2>
      <DomainGrid />
    </>
  );
}
export function ReviewerMocks() {
  const { data, mock } = useReviewer();
  const minutes = (n: number) =>
    data?.timing ? Math.ceil((data.timing.durationMinutes * n) / data.timing.itemCount) : null;
  return (
    <>
      <div className="center-heading">
        <h1>CSE Exam Simulators</h1>
        <p>
          Select an exam length. Questions and choices are randomized on every attempt. Explanations
          appear after submission.
        </p>
      </div>
      <div className="dashboard-grid">
        {(
          [
            {
              count: 25,
              icon: "⚡",
              title: "Mini Mock",
              description: "Ideal for a mid-day check-in.",
            },
            {
              count: 50,
              icon: "🎓",
              title: "Standard Mock",
              description: "Mixed coverage across your CSE knowledge domains.",
            },
            {
              count: 75,
              icon: "🏆",
              title: "Comprehensive Mock",
              description: "A longer practice run to build your pacing.",
            },
          ] as const
        ).map((item) => (
          <LaunchCard
            key={item.count}
            icon={item.icon}
            title={`${item.title} (${item.count} Questions)`}
            description={`${minutes(item.count) ?? "Profile-defined"} minutes limit. ${item.description}`}
            featured={item.count === 50}
            tag={item.count === 50 ? "Recommended" : undefined}
            footer={`Launch ${item.count} Qs`}
            onClick={() => void mock(item.count)}
          />
        ))}
      </div>
      <p className="muted">
        Independent practice simulations. A full official-format CSE paper has a different length;
        these scores are practice results, not an official CSC rating. The server applies the active
        reviewed exam profile’s timing.
      </p>
    </>
  );
}
export function ReviewerTopics() {
  const { data, start } = useReviewer();
  if (!data) return <Loading />;
  return (
    <>
      <h1 className="page-title">Domain-Specific Practice</h1>
      <DomainGrid />
      <h2 className="section-title">Choose a CSE Subcategory</h2>
      <div className="topic-list">
        {data.catalog.areas.map((area) => (
          <details className="cheatsheet-card" key={area.id}>
            <summary>
              {area.label} · {area.count} questions
            </summary>
            <div className="dashboard-grid">
              {area.topics.map((topic) => (
                <div key={topic.id}>
                  <LaunchCard
                    icon="📂"
                    title={topic.label}
                    description={`${topic.count} published questions. Practice up to 50 at a time.`}
                    footer={`Practice ${topic.label}`}
                    onClick={() =>
                      void start({
                        mode: "topic",
                        area: area.id as StartInput["area"],
                        topicId: topic.id,
                      })
                    }
                  />
                  {topic.focuses.length > 1 && (
                    <div className="flex flex-wrap gap-2 pt-3">
                      {topic.focuses.map((focus) => (
                        <Button
                          key={focus.id}
                          className="btn btn-outline"
                          disabled={!focus.count}
                          onClick={() =>
                            void start({
                              mode: "topic",
                              area: area.id as StartInput["area"],
                              topicId: topic.id,
                              providerSubcategory: focus.id as StartInput["providerSubcategory"],
                            })
                          }
                        >
                          {focus.label} ({focus.count})
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
export function ReviewerFlashcards() {
  const { data } = useReviewer();
  const cards = conceptCards.filter((card) => !card.track || card.track === data?.catalog.level);
  const [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false);
  const card = cards[index % cards.length];
  function move(direction: number) {
    setIndex((i) => (i + direction + cards.length) % cards.length);
    setFlipped(false);
  }
  return (
    <>
      <div className="center-heading">
        <h1>Key Terms & Concept Flashcards</h1>
        <p>Click the card to flip and reveal the definition & explanation.</p>
        <p className="mt-2 font-bold">
          Card {(index % cards.length) + 1} of {cards.length}
        </p>
      </div>
      <div className="flashcard-wrapper">
        <button
          type="button"
          className={`flashcard ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped(!flipped)}
          aria-label={flipped ? "Flip back to concept" : "Flip to reveal definition"}
          aria-pressed={flipped}
        >
          <span className="flashcard-face" aria-hidden={flipped}>
            <span className="flashcard-tag">CSE Key Concept</span>
            <span className="flashcard-text">{card.term}</span>
            <span className="flashcard-hint">👆 Click to Flip</span>
          </span>
          <span className="flashcard-face flashcard-back" aria-hidden={!flipped}>
            <span className="flashcard-tag">Concept Summary</span>
            <span className="flashcard-text">{card.definition}</span>
            <span className="flashcard-hint">👆 Click to Flip Back</span>
          </span>
        </button>
        <div className="flashcard-controls">
          <Button className="btn btn-outline" onClick={() => move(-1)}>
            ⬅️ Previous
          </Button>
          <Button className="btn btn-outline" onClick={() => setFlipped(!flipped)}>
            🔄 Flip
          </Button>
          <Button className="btn" onClick={() => move(1)}>
            Next ➡️
          </Button>
        </div>
      </div>
    </>
  );
}
export function ReviewerCheatsheet() {
  const { data } = useReviewer();
  return (
    <>
      <h1 className="page-title">Core CSE Concepts & Formulas</h1>
      {["Verbal Ability", "Analytical Ability", "Clerical Ability", "General Information"]
        .filter(
          (label) =>
            label !==
            (data?.catalog.level === "subprofessional" ? "Analytical Ability" : "Clerical Ability"),
        )
        .map((label) => (
          <section className="cheatsheet-card" key={label}>
            <h2>{label}</h2>
            {conceptCards
              .filter((c) => c.area === label)
              .map((card) => (
                <p key={card.term} className="mb-3">
                  <strong>{card.term}:</strong> {card.definition}
                </p>
              ))}
          </section>
        ))}
      <h2 className="section-title">Key Formulas & Calculations</h2>
      <div className="dashboard-grid">
        {formulaCards.map((card) => (
          <section className="cheatsheet-card" key={card.term}>
            <h2>{card.term}</h2>
            <p>{card.definition}</p>
          </section>
        ))}
      </div>
      <p className="muted">
        Original study reminders for independent CSE practice. These summaries are not official CSC
        material.
      </p>
    </>
  );
}
export function ReviewerAnalytics() {
  const { data } = useReviewer();
  if (!data) return <Loading />;
  return (
    <>
      <h1 className="page-title">Your Exam Performance & History</h1>
      <div className="stats-strip">
        <Stat icon="📊" value={data.examsTaken} label="Total Tests Completed" />
        <Stat
          icon="🎯"
          value={data.averageScore == null ? "—" : `${data.averageScore}%`}
          label="Average Score"
        />
      </div>
      <h2 className="section-title">Recent Exam Attempts</h2>
      {!data.history.length ? (
        <p className="status-message">
          No completed exams yet. Take your first quiz to start tracking your progress.
        </p>
      ) : (
        data.history.map((h) => (
          <article className="history-row" key={h.id}>
            <div>
              <Link href={`/attempts/${h.id}/results`}>{h.label}</Link>
              <p className="muted">
                {new Date(h.submittedAt ?? h.startedAt).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {h.total} questions{h.status === "expired" ? " · Time expired" : ""}
              </p>
            </div>
            <strong>
              {h.percent}% · {h.correct}/{h.total}
            </strong>
          </article>
        ))
      )}
    </>
  );
}
