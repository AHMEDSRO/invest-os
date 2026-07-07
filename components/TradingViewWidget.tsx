'use client';

import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  config: Record<string, unknown>;
  height?: number | string;
};

// حاوية عامة لويدجتس TradingView المجانية (بيانات لحظية بدون backend)
export default function TradingViewWidget({
  src,
  config,
  height = 400,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const json = JSON.stringify(config);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    const script = document.createElement('script');
    script.src = src;
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = json;
    el.appendChild(script);
    return () => {
      el.innerHTML = '';
    };
  }, [src, json]);

  return (
    <div
      ref={ref}
      dir="ltr"
      className="tradingview-widget-container overflow-hidden rounded-2xl"
      style={{ height, width: '100%' }}
    />
  );
}
