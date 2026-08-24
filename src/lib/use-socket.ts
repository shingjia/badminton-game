'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({ path: '/socket.io/', transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

type Handler = (payload: any) => void;

/**
 * Subscribe to a tournament room and register event handlers.
 * Handlers are deregistered on unmount.
 */
export function useTournamentSocket(tournamentId: string, handlers: Record<string, Handler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const socket = getSocket();

    const onAny = (eventName: string) => {
      return (payload: any) => {
        const h = handlersRef.current[eventName];
        if (h) h(payload);
      };
    };

    const events = Object.keys(handlersRef.current);
    const listeners: Record<string, Handler> = {};
    for (const e of events) {
      const fn = onAny(e);
      listeners[e] = fn;
      socket.on(e, fn);
    }

    // Re-subscribe on every connect, not just the first — the server
    // assigns room membership per-connection (server.js's socket.join),
    // so any reconnect (flaky mobile network, backgrounded tab, sleep/
    // wake) starts with zero room membership. A `.once` listener here
    // only re-subscribes the very first time, silently leaving
    // reconnected clients unable to receive any further broadcasts
    // (scores look "stuck") until a full page reload.
    const onConnect = () => socket.emit('subscribe', { tournamentId });
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    return () => {
      socket.emit('unsubscribe', { tournamentId });
      socket.off('connect', onConnect);
      for (const e of events) {
        socket.off(e, listeners[e]);
      }
    };
  }, [tournamentId]);
}
