/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+draft_js
 * @format
 * @flow strict-local
 */

'use strict';

jest.mock('generateRandomKey');

const toggleExperimentalTreeDataSupport = enabled => {
  jest.doMock('gkx', () => name => {
    return name === 'draft_tree_data_support' ? enabled : false;
  });
};

// Seems to be important to put this at the top
toggleExperimentalTreeDataSupport(true);

const BlockMapBuilder = require('BlockMapBuilder');
const ContentBlockNode = require('ContentBlockNode');
const EditorState = require('EditorState');
const SelectionState = require('SelectionState');
const UnicodeUtils = require('UnicodeUtils');

const getSampleStateForTesting = require('getSampleStateForTesting');
const Immutable = require('immutable');
const moveSelectionForward = require('moveSelectionForward');
const removeTextWithStrategy = require('removeTextWithStrategy');

const {List} = Immutable;

const {contentState} = getSampleStateForTesting();

const contentBlockNodes = [
  makeContentBlockNode({
    key: 'A',
    nextSibling: 'B',
    text: 'Alpha',
    type: 'blockquote',
  }),
  makeContentBlockNode({
    key: 'B',
    prevSibling: 'A',
    nextSibling: 'G',
    type: 'ordered-list-item',
    children: List(['C', 'F']),
  }),
  makeContentBlockNode({
    parent: 'B',
    key: 'C',
    nextSibling: 'F',
    type: 'blockquote',
    children: List(['D', 'E']),
  }),
  makeContentBlockNode({
    parent: 'C',
    key: 'D',
    nextSibling: 'E',
    type: 'header-two',
    text: 'Delta',
  }),
  makeContentBlockNode({
    parent: 'C',
    key: 'E',
    prevSibling: 'D',
    type: 'unstyled',
    text: 'Elephant',
  }),
  makeContentBlockNode({
    parent: 'B',
    key: 'F',
    prevSibling: 'C',
    type: 'code-block',
    text: 'Fire',
  }),
  makeContentBlockNode({
    key: 'G',
    prevSibling: 'B',
    nextSibling: 'H',
    type: 'ordered-list-item',
    text: 'Gorila',
  }),
  makeContentBlockNode({
    key: 'H',
    prevSibling: 'G',
    nextSibling: 'I',
    text: ' ',
    type: 'atomic',
  }),
  makeContentBlockNode({
    key: 'I',
    prevSibling: 'H',
    text: 'last',
    type: 'unstyled',
  }),
];

const assertRemoveTextOperation = (
  operation,
  selection = {},
  content = contentBlockNodes,
) => {
  const result = operation(
    EditorState.forceSelection(
      EditorState.createWithContent(
        contentState.set('blockMap', BlockMapBuilder.createFromArray(content)),
      ),
      makeEmptySelection(content[0].key).merge(selection),
    ),
  );
  const expected = result.getBlockMap().toJS();

  expect(expected).toMatchSnapshot();
};

test(`at end of a leaf block and sibling is another leaf block forward delete concatenates`, () => {
  assertRemoveTextOperation(
    editorState =>
      removeTextWithStrategy(
        editorState,
        strategyState => {
          const selection = strategyState.selection;
          const content = strategyState.currentContent;
          const key = selection.getanchorKey;
          const offset = selection.getAnchorOffset();
          const charAhead = content.getBlockForKey(key).text[offset];
          return moveSelectionForward(
            strategyState,
            charAhead ? UnicodeUtils.getUTF16Length(charAhead, 0) : 1,
          );
        },
        'forward',
      ),
    {
      anchorKey: 'D',
      anchorOffset: contentBlockNodes[3].getLength(),
      focusKey: 'D',
      focusOffset: contentBlockNodes[3].getLength(),
    },
  );
});

test(`at end of a leaf block and sibling is not another leaf block forward delete is no-op`, () => {
  // no next sibling
  assertRemoveTextOperation(
    editorState =>
      removeTextWithStrategy(
        editorState,
        strategyState => {
          const selection = strategyState.selection;
          const content = strategyState.currentContent;
          const key = selection.getanchorKey;
          const offset = selection.getAnchorOffset();
          const charAhead = content.getBlockForKey(key).text[offset];
          return moveSelectionForward(
            strategyState,
            charAhead ? UnicodeUtils.getUTF16Length(charAhead, 0) : 1,
          );
        },
        'forward',
      ),
    {
      anchorKey: 'E',
      anchorOffset: contentBlockNodes[4].getLength(),
      focusKey: 'E',
      focusOffset: contentBlockNodes[4].getLength(),
    },
  );
  // next sibling is not a leaf
  assertRemoveTextOperation(
    editorState =>
      removeTextWithStrategy(
        editorState,
        strategyState => {
          const selection = strategyState.selection;
          const content = strategyState.currentContent;
          const key = selection.getanchorKey;
          const offset = selection.getAnchorOffset();
          const charAhead = content.getBlockForKey(key).text[offset];
          return moveSelectionForward(
            strategyState,
            charAhead ? UnicodeUtils.getUTF16Length(charAhead, 0) : 1,
          );
        },
        'forward',
      ),
    {
      anchorKey: 'E',
      anchorOffset: contentBlockNodes[4].getLength(),
      focusKey: 'E',
      focusOffset: contentBlockNodes[4].getLength(),
    },
  );
});

test(`across blocks with forward delete is a no-op`, () => {
  assertRemoveTextOperation(
    editorState =>
      removeTextWithStrategy(
        editorState,
        strategyState => {
          const selection = strategyState.selection;
          const content = strategyState.currentContent;
          const key = selection.getanchorKey;
          const offset = selection.getAnchorOffset();
          const charAhead = content.getBlockForKey(key).text[offset];
          return moveSelectionForward(
            strategyState,
            charAhead ? UnicodeUtils.getUTF16Length(charAhead, 0) : 1,
          );
        },
        'forward',
      ),
    {
      anchorKey: 'D',
      anchorOffset: contentBlockNodes[3].getLength(),
      focusKey: 'E',
      focusOffset: contentBlockNodes[4].getLength(),
    },
  );
});
