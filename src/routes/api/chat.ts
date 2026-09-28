import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { z } from 'zod';
import { createLovableAiGatewayRunIdFetch } from '@/lib/run-id.server';
import { SECTIONS, analyze, excusedClasses, simulateLeave, toISODate, type LeavePlan } from '@/lib/attendance';

const bodySchema = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user','assistant','system']), parts: z.array(z.any()) }).passthrough()).max(100),
  dashboard: z.object({ sectionId: z.string(), percentages: z.record(z.string(), z.number()), planISO: z.string(), leaves: z.record(z.string(), z.object({ kind: z.enum(['od','medical']), start: z.string(), days: z.number() })) }),
});
export const Route = createFileRoute('/api/chat')({ server: { handlers: { POST: async ({ request }) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return new Response('Sign in to ask the Attendance Advisor.', { status: 401 });
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  const aiKey = process.env['LOVABLE_API_KEY'];
  if (!url || !key || !aiKey) return new Response('Advisor configuration is unavailable.', { status: 503 });
  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await db.auth.getUser(token);
  if (userError || !user) return new Response('Please sign in again.', { status: 401 });
  let parsed;
  try { parsed = bodySchema.parse(await request.json()); } catch { return new Response('Invalid advisor request.', { status: 400 }); }
  const { dashboard } = parsed;
  const section = SECTIONS.find(s => s.id === dashboard.sectionId);
  if (!section) return new Response('Select a valid section.', { status: 400 });
  const { data: existing, error: loadError } = await db.from('advisor_conversations').select('messages').eq('user_id', user.id).maybeSingle();
  if (loadError) return new Response('Could not load your conversation.', { status: 500 });
  const saved = Array.isArray(existing?.messages) ? existing.messages as UIMessage[] : [];
  const incoming = parsed.messages as UIMessage[];
  const latest = incoming.at(-1);
  if (!latest || latest.role !== 'user') return new Response('Write a question first.', { status: 400 });
  // The server's saved transcript is authoritative; never trust client-supplied history.
  const messages = [...saved, latest];
  const today = new Date(); today.setHours(0,0,0,0);
  const semesterEnd = new Date(today.getFullYear(),11,12);
  const planDate = new Date(`${dashboard.planISO}T00:00:00`);
  const data = section.subjects.map(subject => {
    const pct = Math.max(0, Math.min(100, dashboard.percentages[subject.id] ?? 80));
    const result = analyze(subject, pct, today, planDate, semesterEnd);
    const leave = dashboard.leaves[subject.id] as LeavePlan | undefined;
    const excused = excusedClasses(today, planDate, subject.classesPerWeek, leave ?? null);
    return { subject: subject.name, classesPerWeek: subject.classesPerWeek, ...result, leave, leaveSimulation: simulateLeave(result, excused) };
  });
  const gateway = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey: aiKey, headers: { 'Lovable-API-Key': aiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' }, fetch: gateway.fetch });
  const result = streamText({
    model: provider.responses('openai/gpt-6-astra'),
    system: `You are Attendance Advisor, a careful student attendance planner. Today is ${toISODate(today)}. Semester end: ${toISODate(semesterEnd)}. Planning date: ${dashboard.planISO}. 75% is the danger floor; 90% is the target. Current dashboard calculations: ${JSON.stringify(data)}. The displayed leave simulation assumes each subject meets on the first classesPerWeek weekdays, from Monday, and OD/medical leave classes are excused from both numerator and denominator. For questions about a new hypothetical leave, use this exact rule to calculate affected scheduled classes, then calculate the final percentage: (attended already + future classes attended) / (held already + future scheduled classes - excused classes). State assumptions, note that actual institutional leave policy and timetable may differ, and warn clearly if 75% is not reachable. Be brief and specific. Never claim you changed dashboard data.`,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: 'medium', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } },
  });
  return result.toUIMessageStreamResponse({ originalMessages: messages, sendReasoning: true, onFinish: async ({ messages: completed, isAborted }) => {
    if (isAborted) return;
    const { error } = await db.from('advisor_conversations').upsert({ user_id: user.id, messages: JSON.parse(JSON.stringify(completed)) }, { onConflict: 'user_id' });
    if (error) console.error('Could not save advisor conversation:', error.message);
  }, onError: (error) => { console.error('Advisor stream error:', error); return error instanceof Error ? error.message : 'The advisor could not answer right now.'; } });
} } } });
