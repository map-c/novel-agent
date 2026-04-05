import { useEffect, useRef, useCallback, useState } from 'react';

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export function useSSE(
  url: string | null,
  onEvent: (event: SSEEvent) => void,
) {
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const close = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;

    setDone(false);
    const es = new EventSource(url);
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      setDone(true);
      es.close();
    };

    // 监听所有已知的事件类型
    const eventTypes = [
      'stage_changed',
      'review_ready',
      'chunk',
      'chapter_complete',
      'error',
      'complete',
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          onEventRef.current(data);
          if (type === 'complete' || type === 'error') {
            setDone(true);
            es.close();
          }
        } catch {
          // ignore parse errors
        }
      });
    }

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [url]);

  return { connected, done, close };
}
