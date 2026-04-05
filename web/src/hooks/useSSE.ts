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
  const closedByUsRef = useRef(false);

  const close = useCallback(() => {
    closedByUsRef.current = true;
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;

    closedByUsRef.current = false;
    setDone(false);

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout>;
    let currentEs: EventSource | null = null;

    const connect = () => {
      const es = new EventSource(url);
      currentEs = es;
      sourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        retryCount = 0;
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        currentEs = null;
        sourceRef.current = null;

        // 如果是用户主动关闭或已完成，不重连
        if (closedByUsRef.current) return;

        // 自动重连，最多重试 5 次，间隔递增
        if (retryCount < 5) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        } else {
          setDone(true);
        }
      };

      // 监听所有已知的事件类型
      const eventTypes = [
        'stage_changed',
        'review_ready',
        'clarify_questions',
        'chunk',
        'chapter_complete',
        'error',
        'complete',
        'heartbeat',
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (e) => {
          if (type === 'heartbeat') return; // 心跳事件仅保持连接
          try {
            const data = JSON.parse((e as MessageEvent).data);
            onEventRef.current(data);
            if (type === 'complete' || type === 'error' || type === 'review_ready' || type === 'clarify_questions') {
              closedByUsRef.current = true; // 防止 onerror 重连
              setDone(true);
              es.close();
            }
          } catch {
            // ignore parse errors
          }
        });
      }
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      clearTimeout(retryTimer);
      if (currentEs) {
        currentEs.close();
        currentEs = null;
      }
      sourceRef.current = null;
    };
  }, [url]);

  return { connected, done, close };
}
