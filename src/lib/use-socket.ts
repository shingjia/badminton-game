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

    if (socket.connected) {
      socket.emit('subscribe', { tournamentId });
    } else {
      socket.once('connect', () => socket.emit('subscribe', { tournamentId }));
    }

    return () => {
      socket.emit('unsubscribe', { tournamentId });
      for (const e of events) {
        socket.off(e, listeners[e]);
      }
    };
  }, [tournamentId]);
}
