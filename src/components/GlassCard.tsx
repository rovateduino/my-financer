/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface GlassCardProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverEffect?: boolean;
}

export default function GlassCard({ id, children, className = '', onClick, hoverEffect = false }: GlassCardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      id={id}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/65 p-6 text-left shadow-xl backdrop-blur-md ${className} ${
        onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900' : ''
      }`}
    >
      {children}
    </Component>
  );
}
