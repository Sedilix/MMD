'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';

interface ErrorNotification {
  id: string;
  message: string;
  timestamp: number;
}

const errorStack: ErrorNotification[] = [];
const listeners: Set<(errors: ErrorNotification[]) => void> = new Set();

export function logDesktopError(message: string) {
  const error: ErrorNotification = {
    id: `${Date.now()}-${Math.random()}`,
    message,
    timestamp: Date.now(),
  };
  errorStack.push(error);
  if (errorStack.length > 5) errorStack.shift();
  listeners.forEach(l => l([...errorStack]));
  setTimeout(() => {
    errorStack.splice(0, 1);
    listeners.forEach(l => l([...errorStack]));
  }, 5000);
}

export function DesktopErrorNotification() {
  const [errors, setErrors] = useState<ErrorNotification[]>([]);

  useEffect(() => {
    listeners.add(setErrors);
    return () => {
      listeners.delete(setErrors);
    };
  }, []);

  if (errors.length === 0) return null;

  const latest = errors[errors.length - 1];

  return (
    <div className="fixed bottom-4 left-4 z-[10000] max-w-sm">
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-950/90 border border-red-800/60 text-red-200 text-sm backdrop-blur-sm shadow-lg">
        <Icon name="alert-circle" className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="break-words font-medium text-red-100">{latest.message}</p>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(latest.message);
          }}
          className="flex-shrink-0 text-red-300 hover:text-red-100 transition-colors p-1"
          title="Copy error message"
        >
          <Icon name="copy" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
