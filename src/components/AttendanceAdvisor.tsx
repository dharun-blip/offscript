import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { MessageCircle, X, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputBody, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput, type ToolPart } from '@/components/ai-elements/tool';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import type { User } from '@supabase/supabase-js';
import type { LeavePlan } from '@/lib/attendance';

interface Props { sectionId: string; percentages: Record<string, number>; planISO: string; leaves: Record<string, LeavePlan> }
function AdvisorChat({ dashboard }: { dashboard: Props }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [loadError, setLoadError] = useState('');
  const dashboardRef = useRef(dashboard);
  dashboardRef.current = dashboard;
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', headers: async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
  }, body: () => ({ dashboard: dashboardRef.current }) }), []);
  const { messages, setMessages, sendMessage, status, stop, error } = useChat({ transport });
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data, error: fetchError } = await supabase.from('advisor_conversations').select('messages').eq('user_id', user.id).maybeSingle();
      if (!mounted) return;
      if (fetchError) setLoadError('Could not load previous messages.');
      else if (Array.isArray(data?.messages)) setMessages(data.messages as UIMessage[]);
    });
    return () => { mounted = false; };
  }, [setMessages]);
  useEffect(() => { if (status === 'ready') inputRef.current?.focus(); }, [status]);
  return <div className="flex min-h-0 flex-1 flex-col">
    <Conversation className="min-h-0 flex-1"><ConversationContent className="gap-4 p-4">
      {messages.length === 0 && <ConversationEmptyState title="Ask about your attendance" description="Your current section, percentages, and leave plans are included with every question." icon={<MessageCircle className="size-7 text-brand-soft" />} />}
      {messages.map(message => <Message key={message.id} from={message.role}><MessageContent className={message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}>
        {message.parts.map((part, i) => part.type === 'text' ? <MessageResponse key={i}>{part.text}</MessageResponse> : part.type.startsWith('tool-') || part.type === 'dynamic-tool' ? <Tool key={i} defaultOpen={false} className="border-border"><ToolHeader type={part.type as ToolPart['type']} state={(part as ToolPart).state} toolName={part.type === 'dynamic-tool' ? (part as Extract<ToolPart,{type:'dynamic-tool'}>).toolName : undefined} /><ToolContent><ToolInput input={(part as ToolPart).input} /><ToolOutput output={(part as ToolPart).output} errorText={(part as ToolPart).errorText} /></ToolContent></Tool> : null)}
      </MessageContent></Message>)}
      {status === 'submitted' && <Shimmer className="text-sm">Thinking...</Shimmer>}
    </ConversationContent><ConversationScrollButton /></Conversation>
    {(error || loadError) && <p role="alert" className="px-4 py-2 text-sm text-danger-soft">{error?.message || loadError}</p>}
    <div className="border-t border-border p-3"><PromptInput onSubmit={({ text }) => { if (text.trim()) { sendMessage({ text: text.trim() }); requestAnimationFrame(() => inputRef.current?.focus()); } }}><PromptInputBody><PromptInputTextarea ref={inputRef} autoFocus placeholder="Ask about a sick leave or your 75% threshold…" /></PromptInputBody><PromptInputFooter className="justify-end"><PromptInputSubmit status={status} onStop={stop} disabled={status !== 'ready' && status !== 'streaming'} /></PromptInputFooter></PromptInput></div>
  </div>;
}
export function AttendanceAdvisor(props: Props) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [register, setRegister] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)); const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null)); return () => data.subscription.unsubscribe(); }, []);
  const handleAuth = async (e: React.FormEvent) => { e.preventDefault(); setAuthBusy(true); setAuthError(''); const { error } = register ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password }); if (error) setAuthError(error.message); else if (register) setAuthError('Check your email to confirm your account, then sign in.'); setAuthBusy(false); };
  const handleGoogle = async () => { setAuthBusy(true); setAuthError(''); const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin }); if (result.error) setAuthError(result.error.message); setAuthBusy(false); };
  return <>
    <Button type="button" aria-label={open ? 'Close Attendance Advisor' : 'Open Attendance Advisor'} title="Attendance Advisor" onClick={() => setOpen(!open)} className="fixed bottom-5 right-5 z-40 h-14 gap-2 rounded-full px-5 shadow-lg sm:bottom-7 sm:right-7">{open ? <X /> : <MessageCircle />}<span>{open ? 'Close' : 'Attendance Advisor'}</span></Button>
    {open && <section aria-label="Attendance Advisor" className="fixed bottom-24 right-3 z-40 flex h-[min(680px,calc(100dvh-120px))] w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl sm:right-7">
      <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-display text-base font-semibold">Attendance Advisor</h2><p className="text-xs text-muted-foreground">Personalized guidance for your section</p></div>{user && <Button variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={() => supabase.auth.signOut()}><LogOut /></Button>}</header>
      {user ? <AdvisorChat dashboard={props} /> : <div className="flex flex-1 flex-col justify-center gap-4 p-6"><div><h3 className="font-display text-xl font-semibold">{register ? 'Create an account' : 'Sign in to ask'}</h3><p className="mt-1 text-sm text-muted-foreground">Your advisor conversation is saved to your account.</p></div><form onSubmit={handleAuth} className="grid gap-3"><input className="h-10 rounded-md border border-input bg-background px-3 text-sm" type="email" placeholder="Email" aria-label="Email" required value={email} onChange={e => setEmail(e.target.value)} /><input className="h-10 rounded-md border border-input bg-background px-3 text-sm" type="password" placeholder="Password" aria-label="Password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /><Button disabled={authBusy} type="submit">{register ? 'Create account' : 'Sign in'}</Button></form><Button variant="outline" disabled={authBusy} onClick={handleGoogle}>Continue with Google</Button><Button variant="link" onClick={() => { setRegister(!register); setAuthError(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</Button>{authError && <p role="alert" className="text-sm text-danger-soft">{authError}</p>}</div>}
    </section>}
  </>;
}
