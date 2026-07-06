'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import type { ChatMessage } from '@/lib/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // آخر 50 رسالة
  useEffect(() => {
    (async () => {
      const { data } = await getSupabase()
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setMessages(((data as ChatMessage[]) ?? []).reverse());
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setInput('');
    setSending(true);
    setMessages((m) => [
      ...m,
      {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'حصل خطأ — حاول تاني');
      } else {
        setMessages((m) => [
          ...m,
          {
            id: `tmp-a-${Date.now()}`,
            role: 'assistant',
            content: data.reply,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setError('مشكلة في الاتصال — حاول تاني');
    }
    setSending(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <h1 className="mb-4 text-xl font-bold">
        مستشار Invest-OS
        <span className="mr-3 text-xs font-normal text-zinc-500">
          مش مستشار مالي مرخّص — القرار النهائي ليك دايمًا
        </span>
      </h1>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        {messages.length === 0 && (
          <p className="pt-16 text-center text-sm text-zinc-600">
            اسألني عن محفظتك، نقطة التعادل d*، توزيع إيداع الشهر، أو مقارنة
            الجنيه بالدرهم
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                m.role === 'user'
                  ? 'bg-amber-500/15 text-amber-100'
                  : 'bg-zinc-800 text-zinc-200'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-end">
            <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm text-zinc-500">
              بيفكر…
            </div>
          </div>
        )}
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب سؤالك…"
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-xl bg-amber-500 px-6 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          إرسال
        </button>
      </form>
    </div>
  );
}
