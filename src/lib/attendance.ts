export interface SubjectDef {
  id: string;
  name: string;
  classesPerWeek: number;
}

export interface SectionDef {
  id: string;
  label: string;
  detail: string;
  subjects: SubjectDef[];
}

export const DANGER_FLOOR = 0.75;
export const TARGET = 0.9;

export const SECTIONS: SectionDef[] = [
  {
    id: "biom-c",
    label: "BIOM-104 · Section C",
    detail: "Semester ends Dec 12",
    subjects: [
      { id: "bio", name: "Biology", classesPerWeek: 3 },
      { id: "calc", name: "Calculus II", classesPerWeek: 4 },
      { id: "hist", name: "World History", classesPerWeek: 2 },
      { id: "chem", name: "Chemistry", classesPerWeek: 3 },
    ],
  },
  {
    id: "cs-a",
    label: "CS-201 · Section A",
    detail: "Semester ends Dec 12",
    subjects: [
      { id: "ds", name: "Data Structures", classesPerWeek: 4 },
      { id: "dm", name: "Discrete Math", classesPerWeek: 3 },
      { id: "eng", name: "Technical Writing", classesPerWeek: 2 },
    ],
  },
  {
    id: "econ-b",
    label: "ECON-210 · Section B",
    detail: "Semester ends Dec 12",
    subjects: [
      { id: "micro", name: "Microeconomics", classesPerWeek: 3 },
      { id: "stats", name: "Statistics", classesPerWeek: 3 },
      { id: "acct", name: "Accounting", classesPerWeek: 2 },
    ],
  },
];

/** Whole weeks (rounded up) between two dates, times classes per week. */
export function classesRemaining(from: Date, to: Date, perWeek: number): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  const weeks = ms / (7 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(weeks * perWeek));
}

export interface SubjectResult {
  subject: SubjectDef;
  attended: number;
  held: number;
  remaining: number;
  total: number;
  pct: number;
  neededForFloor: number | null; // null = impossible
  neededForTarget: number | null; // null = impossible
  maxPossible: number; // pct if attending everything left
  irreversible: boolean; // cannot clear floor before planning date
}

export function analyze(
  subject: SubjectDef,
  pct: number,
  today: Date,
  planDate: Date,
  semesterEnd: Date,
): SubjectResult {
  const remainingSemester = classesRemaining(today, semesterEnd, subject.classesPerWeek);
  const remainingPlan = classesRemaining(today, planDate, subject.classesPerWeek);
  // Assume a 16-week semester: held = total - remaining
  const total = subject.classesPerWeek * 16;
  const held = Math.max(0, total - remainingSemester);
  const attended = Math.round((pct / 100) * held);

  const need = (threshold: number, remaining: number): number | null => {
    const finalTotal = held + remaining;
    const required = Math.ceil(threshold * finalTotal - attended - 1e-9);
    if (required <= 0) return 0;
    if (required > remaining) return null;
    return required;
  };

  const neededForFloor = need(DANGER_FLOOR, remainingPlan);
  const neededForTarget = need(TARGET, remainingPlan);
  const finalTotal = held + remainingPlan;
  const maxPossible = finalTotal > 0 ? (attended + remainingPlan) / finalTotal : 0;

  return {
    subject,
    attended,
    held,
    remaining: remainingPlan,
    total,
    pct,
    neededForFloor,
    neededForTarget,
    maxPossible,
    irreversible: neededForFloor === null,
  };
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
