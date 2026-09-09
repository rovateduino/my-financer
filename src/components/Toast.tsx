/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

const ToastItem = ({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration || 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const iconStyles = {
    success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    error: { icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    info: { icon: Info, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  };

  const style = iconStyles[toast.type];
  const Icon = style.icon;

  return (
    <div className={`flex items-start space-x-3 rounded-xl border ${style.border} ${style.bg} p-4 shadow-xl backdrop-blur-md`}>
      <Icon className={`h-5 w-5 ${style.color} shrink-0 mt-0.5`} />
      <p className="text-sm text-slate-200 flex-1">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className={`p-1 rounded-lg hover:bg-slate-800/50 transition-colors text-slate-400 hover:text-slate-200`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3 max-w-md w-full">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}
