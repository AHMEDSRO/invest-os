'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtMoney, fmtNum } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/client';
import type { ChatMessage } from '@/lib/types';

type PendingDeposit = {
  fund_id: string;
  fund_name: string;
  amount: number;
  currency: 'EGP' | 'AED';
  date: string;
  aed_egp_rate: number | null;
  reason: string | null;
};

type Attachment = { base64: string; mime: string; name: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDeposit | null>(null);
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
  }, [messages, sending, pending]);

  function pushLocal(role: 'user' | 'assistant', content: string) {
    setMessages((m) => [
      ...m,
      {
        id: `tmp-${role}-${Date.now()}`,
        role,
        content,
        created_at: new Date().toISOString(),
      },
    ]);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError('الصورة أكبر من 4 ميجا — صغّرها الأول');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setAttach({ base64, mime: file.type, name: file.name });
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text =
      input.trim() || (attach ? 'سجّل الإيداع اللي في الإيصال ده' : '');
    if (!text || sending) return;

    setError(null);
    setInput('');
    setSending(true);
    setPending(null);
    pushLocal('user', attach ? `${text}\n📎 ${attach.name}` : text);
    const currentAttach = attach;
    setAttach(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(currentAttach
            ? { imageBase64: currentAttach.base64, imageMime: currentAttach.mime }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'حصل خطأ — حاول تاني');
      } else {
        pushLocal('assistant', data.reply);
        if (data.pendingDeposit) setPending(data.pendingDeposit);
      }
    } catch {
      setError('مشكلة في الاتصال — حاول تاني');
    }
    setSending(false);
  }

  // تأكيد تسجيل الإيداع اللي استخرجه المستشار
  async function confirmDeposit() {
    if (!pending || confirming) return;
    setConfirming(true);
    const supabase = getSupabase();
    const { error: depErr } = await supabase.from('deposits').insert({
      date: pending.date,
      fund_id: pending.fund_id,
      amount: pending.amount,
      currency: pending.currency,
      aed_egp_rate: pending.aed_egp_rate,
      reason: pending.reason || 'اتسجل من الشات',
    });
    if (!depErr && pending.aed_egp_rate) {
      await supabase
        .from('fx_history')
        .upsert({ date: pending.date, aed_egp: pending.aed_egp_rate });
    }
    setConfirming(false);
    if (depErr) {
      setError('حصل خطأ في التسجيل — جرب من صفحة الإيداعات');
      return;
    }
    pushLocal(
      'assistant',
      `✅ اتسجل: ${fmtMoney(pending.amount, pending.currency)} في «${pending.fund_name}» بتاريخ ${pending.date}`
    );
    setPending(null);
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
            اسألني عن محفظتك أو نقطة التعادل d* — أو قولي «حطيت 500 جنيه في
            الصندوق النقدي» أو ابعت صورة الإيصال 📎 وأنا أسجلها
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

        {/* كارت تأكيد الإيداع — مفيش حاجة بتتسجل من غير موافقتك */}
        {pending && (
          <div className="rounded-2xl border border-amber-600/50 bg-amber-950/20 p-4">
            <p className="mb-2 text-sm font-bold text-amber-300">
              تأكيد تسجيل إيداع
            </p>
            <ul className="mb-3 space-y-1 text-sm text-zinc-300">
              <li>
                الصندوق: <span className="font-medium">{pending.fund_name}</span>
              </li>
              <li>
                المبلغ:{' '}
                <span className="num font-bold text-amber-200">
                  {fmtMoney(pending.amount, pending.currency)}
                </span>
              </li>
              <li>
                التاريخ: <span className="num">{pending.date}</span>
              </li>
              {pending.aed_egp_rate && (
                <li>
                  سعر الصرف المستخدم:{' '}
                  <span className="num">{fmtNum(pending.aed_egp_rate, 2)}</span>
                </li>
              )}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={confirmDeposit}
                disabled={confirming}
                className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                {confirming ? 'جاري…' : 'تأكيد وتسجيل ✓'}
              </button>
              <button
                onClick={() => setPending(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-400"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {attach && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
          <span>📎 {attach.name}</span>
          <button
            onClick={() => setAttach(null)}
            className="mr-auto text-zinc-500 hover:text-red-400"
          >
            ✕ شيل
          </button>
        </div>
      )}

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="أرفق صورة إيصال"
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-lg transition-colors hover:border-amber-500"
        >
          📎
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={attach ? 'اكتب ملاحظة أو ابعت على طول…' : 'اكتب سؤالك…'}
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={sending || (!input.trim() && !attach)}
          className="rounded-xl bg-amber-500 px-5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          إرسال
        </button>
      </form>
    </div>
  );
}
