import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ErrorBoundary from '../ErrorBoundary.js';

test('ErrorBoundary renders fallback when a child component throws', () => {
  class ThrowingChild extends React.Component {
    override render(): React.ReactNode {
      throw new Error('boom');
    }
  }

  const html = renderToStaticMarkup(
    <ErrorBoundary fallback={<div>Falha ao carregar a importação</div>}>
      <ThrowingChild />
    </ErrorBoundary>
  );

  assert.match(html, /Falha ao carregar a importação/);
});
