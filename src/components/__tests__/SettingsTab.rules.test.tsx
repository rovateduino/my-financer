import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsTab from '../SettingsTab.js';

test('renderiza ação de exclusão para regras de credor', () => {
  const html = renderToStaticMarkup(
    <SettingsTab
      categories={[]}
      members={[]}
      rules={[{ id: 1, beneficiary: 'ENEL', suggested_category: 'Energia', suggested_category_id: 6 }]}
      onAddCategory={() => {}}
      onDeleteCategory={async () => {}}
      onAddMember={() => {}}
      onDeleteMember={async () => {}}
      onAddRule={() => {}}
      onDeleteRule={() => {}}
      onClearCache={() => {}}
      onExportBackup={() => {}}
      onImportBackup={() => {}}
      onResetDatabase={() => {}}
    />
  );

  assert.match(html, /Excluir regra/i);
});
