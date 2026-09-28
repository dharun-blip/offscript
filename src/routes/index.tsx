import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { AttendanceAdvisor } from "@/components/AttendanceAdvisor";
import { Button } from "@/components/ui/button";
import {
  DANGER_FLOOR,
  SECTIONS,
  TARGET,
  analyze,
  formatDate,
  excusedClasses,
  simulateLeave,
  type LeavePlan,
  toISODate,
  type SubjectResult,
} from "@/lib/attendance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Core Calculator · Attendance Ledger" },
      {
        name: "description",
        content:
          "Enter your class section and attendance percentages to see how many remaining classes you must attend to clear 75% or reach 90% before the semester ends.",
      },
      { property: "og:title", content: "The Core Calculator · Attendance Ledger" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content:
          "Know exactly how many classes stand between you and detention. Live attendance math per subject.",
      },
    ],
  }),
  component: Index,
});

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pctTone(p: number) {
  if (p >= TARGET * 100) return "text-safe-soft";
  if (p >= DANGER_FLOOR * 100) return "text-warn-soft";
  return "text-danger-soft";
}

function barTone(p: number) {
  if (p >= TARGET * 100) return "bg-safe-soft";
  if (p >= DANGER_FLOOR * 100) return "bg-warn-soft";
  return "bg-danger-soft";
}

function Index() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const year = today.getFullYear();
  const semesterEnd = useMemo(() => new Date(year, 11, 12), [year]);
  const november = useMemo(() => new Date(year, 10, 1), [year]);

  const [sectionId, setSectionId] = useState(SECTIONS[0]!.id);
  const section = SECTIONS.find((s) => s.id === sectionId)!;

  const defaultPlan = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 14);
    return toISODate(d > semesterEnd ? semesterEnd : d);
  }, [today, semesterEnd]);
  const [planISO, setPlanISO] = useState(defaultPlan);
  const planDate = useMemo(() => startOfDay(new Date(`${planISO}T00:00:00`)), [planISO]);

  const [pcts, setPcts] = useState<Record<string, number>>({});
  const [leaves, setLeaves] = useState<Record<string, LeavePlan>>({});
  const updateLeave = (id: string, update: Partial<LeavePlan>) => setLeaves(prev => ({ ...prev, [id]: { kind: "medical", start: toISODate(today), days: 0, ...prev[id], ...update } }));
  const getPct = (id: string) => pcts[id] ?? 80;

  const results: SubjectResult[] = section.subjects.map((s) =>
    analyze(s, getPct(s.id), today, planDate, semesterEnd),
  );

  const doomed = section.subjects
    .map((s) => analyze(s, getPct(s.id), today, november, semesterEnd))
    .filter((r) => r.irreversible && r.remaining >= 0 && november > today);

  const chartData = results.map(r => ({ name: r.subject.name, current: r.pct, projected: Math.round(simulateLeave(r, excusedClasses(today, planDate, r.subject.classesPerWeek, leaves[r.subject.id] ?? null)).projectedPct * 10) / 10 }));
  const overall = results.length ? Math.round(results.reduce((a, r) => a + r.pct, 0) / results.length) : 0;
  const totalRemaining = results.reduce((a, r) => a + r.remaining, 0);
  const totalFloor = results.reduce((a, r) => a + (r.neededForFloor ?? r.remaining), 0);
  const totalTarget = results.reduce((a, r) => a + (r.neededForTarget ?? r.remaining), 0);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-ink font-body text-mist">


      <div className="relative mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-brand/20 ring-1 ring-brand/40 backdrop-blur-sm">
              <span className="font-display text-base font-semibold text-brand-soft">A</span>
            </div>
            <div>
              <p className="font-display text-base font-semibold leading-none text-mist">
                Attendance&nbsp;Ledger
              </p>
              <p className="mt-1 text-xs text-mist-soft">Calibrate before it's too late</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-mist/5 px-4 py-2 ring-1 ring-border backdrop-blur-md">
            <span className="size-2 rounded-full bg-safe-soft" />
            <span className="text-xs text-mist-soft">
              Today: <span className="text-mist">{formatDate(today)}</span>
            </span>
          </div>
        </header>

        <p
          className="mt-8 font-display text-3xl font-semibold leading-tight text-mist sm:text-4xl"
          style={{ maxWidth: "20ch" }}
        >
          Know exactly how many classes stand between you and detention.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* INPUT PANEL */}
          <section className="flex flex-col gap-5 rounded-3xl bg-mist/10 p-5 ring-1 ring-border backdrop-blur-2xl sm:p-6">
            <h2 className="font-display text-sm font-medium uppercase tracking-[0.14em] text-mist-soft">
              Your class section
            </h2>
            <div className="flex flex-col gap-1 rounded-2xl bg-ink/40 p-1 ring-1 ring-border">
              {SECTIONS.map((s) => {
                const active = s.id === sectionId;
                return (
                  <Button
                    variant="ghost"
                    key={s.id}
                    type="button"
                    onClick={() => setSectionId(s.id)}
                    className={`h-auto w-full justify-between whitespace-normal rounded-lg px-4 py-3 text-left transition-colors ${
                      active ? "bg-brand/25 ring-1 ring-brand/40" : "hover:bg-mist/5"
                    }`}
                  >
                    <div>
                      <p className="font-display text-sm font-semibold text-mist">{s.label}</p>
                      <p className="text-xs text-mist-soft">
                        {s.subjects.length} subjects · {s.detail}
                      </p>
                    </div>
                    <span
                      className={`size-5 shrink-0 rounded-full ${
                        active ? "bg-brand-soft/40 ring-2 ring-brand-soft" : "ring-2 ring-border"
                      }`}
                    />
                  </Button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="plan" className="text-xs text-mist-soft">
                  Planning date
                </label>
                <input
                  id="plan"
                  type="date"
                  value={planISO}
                  min={toISODate(today)}
                  max={toISODate(semesterEnd)}
                  onChange={(e) => setPlanISO(e.target.value)}
                  className="mt-1.5 w-full rounded-xl bg-ink/40 px-3 py-2.5 text-sm text-mist ring-1 ring-border outline-none focus:ring-brand-soft"
                />
              </div>
              <div>
                <span className="text-xs text-mist-soft">Danger floor</span>
                <div className="mt-1.5 rounded-xl bg-ink/40 px-3 py-2.5 text-sm text-mist ring-1 ring-border">
                  {DANGER_FLOOR * 100}%
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-display text-sm font-medium uppercase tracking-[0.14em] text-mist-soft">OD / Medical leave</h2>
              <p className="mt-1 text-xs text-mist-soft">Excused classes are excluded from the attendance total. Confirm your institution's policy.</p>
              <div className="mt-3 space-y-3">
                {section.subjects.map(s => {
                  const leave = leaves[s.id] ?? { kind: "medical" as const, start: toISODate(today), days: 0 };
                  const result = results.find(r => r.subject.id === s.id);
                  const simulation = result ? simulateLeave(result, excusedClasses(today, planDate, s.classesPerWeek, leave)) : null;
                  return <div key={s.id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2"><span className="text-sm text-mist">{s.name}</span><span className={`font-display text-sm font-semibold ${simulation ? pctTone(simulation.projectedPct) : ''}`}>{simulation?.projectedPct.toFixed(1)}% projected</span></div>
                    <div className="mt-2 grid grid-cols-[1fr_1fr_68px] gap-2">
                      <select aria-label={`${s.name} leave type`} value={leave.kind} onChange={e => updateLeave(s.id, { kind: e.target.value as LeavePlan['kind'] })} className="min-w-0 rounded-md border border-border bg-ink px-2 py-2 text-xs text-mist"><option value="medical">Medical</option><option value="od">On-duty</option></select>
                      <input aria-label={`${s.name} leave start`} type="date" min={toISODate(today)} max={toISODate(semesterEnd)} value={leave.start} onChange={e => updateLeave(s.id, { start: e.target.value })} className="min-w-0 rounded-md border border-border bg-ink px-1 py-2 text-xs text-mist" />
                      <input aria-label={`${s.name} leave days`} type="number" min={0} max={90} value={leave.days} onChange={e => updateLeave(s.id, { days: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} className="min-w-0 rounded-md border border-border bg-ink px-2 py-2 text-xs text-mist" />
                    </div><p className="mt-1 text-xs text-mist-soft">{simulation?.excused ?? 0} excused classes · {simulation?.neededForFloor ?? 'Not possible'} to clear 75%</p>
                  </div>;
                })}
              </div>
            </div>

            <div>
              <h2 className="font-display text-sm font-medium uppercase tracking-[0.14em] text-mist-soft">
                Current attendance
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {section.subjects.map((s) => {
                  const p = getPct(s.id);
                  return (
                    <div key={s.id} className="rounded-2xl bg-ink/40 p-3.5 ring-1 ring-border">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`pct-${s.id}`} className="text-sm text-mist">
                          {s.name}
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            id={`pct-${s.id}`}
                            type="number"
                            min={0}
                            max={100}
                            value={p}
                            onChange={(e) =>
                              setPcts((prev) => ({
                                ...prev,
                                [s.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              }))
                            }
                            className={`w-14 bg-transparent text-right font-display text-sm font-semibold outline-none ${pctTone(p)}`}
                          />
                          <span className={`font-display text-sm font-semibold ${pctTone(p)}`}>
                            %
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-mist/10">
                        <div
                          className={`h-full rounded-full ${barTone(p)}`}
                          style={{ width: `${p}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* RESULTS DASHBOARD */}
          <section className="flex flex-col gap-5">
            {doomed.length > 0 && (
              <div className="pulse-danger flex items-start gap-4 rounded-3xl bg-danger/15 p-5 ring-1 ring-danger/50 backdrop-blur-xl sm:p-6">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-danger/30 ring-1 ring-danger/60">
                  <span className="font-display text-lg font-semibold text-danger-soft">!</span>
                </div>
                <div>
                  <p className="font-display text-lg font-semibold leading-tight text-danger-soft">
                    Irreversible Detention — {doomed.map((d) => d.subject.name).join(", ")}
                  </p>
                  <p className="mt-1 text-sm text-mist/80">
                    Even attending every remaining class,{" "}
                    {doomed.length === 1 ? doomed[0]!.subject.name : "these subjects"} cap
                    {doomed.length === 1 ? "s" : ""} at{" "}
                    <span className="font-semibold text-mist">
                      {Math.round(Math.max(...doomed.map((d) => d.maxPossible)) * 100)}%
                    </span>{" "}
                    before November. Recovery is mathematically impossible. Contact your advisor
                    now.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rise-in rounded-2xl bg-mist/10 p-4 ring-1 ring-border backdrop-blur-xl">
                <p className="text-xs text-mist-soft">Classes remaining</p>
                <p className="mt-1 font-display text-3xl font-semibold leading-none text-mist">
                  {totalRemaining}
                </p>
              </div>
              <div
                className="rise-in rounded-2xl bg-mist/10 p-4 ring-1 ring-border backdrop-blur-xl"
                style={{ animationDelay: ".08s" }}
              >
                <p className="text-xs text-mist-soft">Attend to clear 75%</p>
                <p className="mt-1 font-display text-3xl font-semibold leading-none text-safe-soft">
                  {totalFloor}
                </p>
              </div>
              <div
                className="rise-in rounded-2xl bg-mist/10 p-4 ring-1 ring-border backdrop-blur-xl"
                style={{ animationDelay: ".16s" }}
              >
                <p className="text-xs text-mist-soft">Attend to reach 90%</p>
                <p className="mt-1 font-display text-3xl font-semibold leading-none text-brand-soft">
                  {totalTarget}
                </p>
              </div>
            </div>

            <section aria-label="Attendance health" className="border-y border-border py-5">
              <div className="mb-4 flex items-baseline justify-between"><div><h2 className="font-display text-base font-semibold">Attendance health</h2><p className="text-xs text-mist-soft">Current vs. projected with leave</p></div><span className={`font-display text-2xl font-semibold ${pctTone(overall)}`}>{overall}% overall</span></div>
              <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ left: -20, right: 4, top: 10, bottom: 2 }}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="name" tick={{ fill: 'var(--mist-soft)', fontSize: 11 }} interval={0} /><YAxis domain={[0,100]} tick={{ fill: 'var(--mist-soft)', fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--mist)' }} /><ReferenceLine y={75} stroke="var(--danger-soft)" strokeDasharray="4 4" /><Bar dataKey="current" name="Current" fill="var(--brand-soft)" radius={[3,3,0,0]} maxBarSize={24} /><Bar dataKey="projected" name="Projected" radius={[3,3,0,0]} maxBarSize={24}>{chartData.map((entry, index) => <Cell key={index} fill={entry.projected < 75 ? 'var(--danger-soft)' : 'var(--safe-soft)'} />)}</Bar></BarChart></ResponsiveContainer></div>
              <div className="mt-2 flex gap-5 text-xs text-mist-soft"><span><i className="mr-1 inline-block size-2 bg-brand-soft" />Current</span><span><i className="mr-1 inline-block size-2 bg-safe-soft" />Projected</span><span>Dashed line: 75% floor</span></div>
            </section>
            <div className="flex flex-col gap-3">
              {results.map((r) => {
                const locked = r.irreversible;
                const atRisk = !locked && r.pct < TARGET * 100;
                const tone = locked
                  ? "bg-danger/10 ring-danger/40"
                  : atRisk
                    ? "bg-warn/10 ring-warn/40"
                    : "bg-safe/10 ring-safe/40";
                const dot = locked
                  ? "bg-danger-soft"
                  : atRisk
                    ? "bg-warn-soft"
                    : "bg-safe-soft";
                const chip = locked
                  ? "bg-danger/25 text-danger-soft"
                  : atRisk
                    ? "bg-warn/25 text-warn-soft"
                    : "bg-safe/25 text-safe-soft";
                const big = locked
                  ? "text-danger-soft"
                  : atRisk
                    ? "text-warn-soft"
                    : "text-safe-soft";
                const label = locked ? "Detention locked" : atRisk ? "At risk" : "On track";
                const detail = locked
                  ? `${r.pct}% now · max ${Math.round(r.maxPossible * 100)}% by ${formatDate(planDate)}`
                  : r.neededForTarget === null
                    ? `${r.pct}% now · attend ${r.neededForFloor} of ${r.remaining} to hold 75%`
                    : `${r.pct}% now · attend ${r.neededForTarget} of ${r.remaining} to ${
                        r.pct >= TARGET * 100 ? "hold" : "hit"
                      } 90%`;

                return (
                  <div
                    key={r.subject.id}
                    className={`flex items-center justify-between gap-4 rounded-2xl p-4 ring-1 backdrop-blur-xl ${tone}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
                        <p className="font-display text-sm font-semibold text-mist">
                          {r.subject.name}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chip}`}
                        >
                          {label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-mist-soft">{detail}</p>
                    </div>
                    <p className={`font-display text-2xl font-semibold leading-none ${big}`}>
                      {r.pct}%
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <AttendanceAdvisor sectionId={sectionId} percentages={Object.fromEntries(section.subjects.map(s => [s.id, getPct(s.id)]))} planISO={planISO} leaves={leaves} />
    </div>
  );
}
