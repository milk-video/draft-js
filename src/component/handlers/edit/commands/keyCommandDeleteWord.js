/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @emails oncall+draft_js
 */

'use strict';

const DraftRemovableWord = require('DraftRemovableWord');
const EditorState = require('EditorState');

const moveSelectionForward = require('moveSelectionForward');
const removeTextWithStrategy = require('removeTextWithStrategy');

/**
 * Delete the word that is right of the cursor, as well as any spaces or
 * punctuation before the word.
 */
function keyCommandDeleteWord(editorState: EditorState): EditorState {
  const afterRemoval = removeTextWithStrategy(
    editorState,
    strategyState => {
      const selection = strategyState.selection;
      const offset = selection.getStartOffset();
      const key = selection.getStartKey();
      const content = strategyState.currentContent;
      const text = content
        .getBlockForKey(key)
        .text
        .slice(offset);
      const toRemove = DraftRemovableWord.getForward(text);

      // If there are no words in front of the cursor, remove the newline.
      return moveSelectionForward(strategyState, toRemove.length || 1);
    },
    'forward',
  );

  if (afterRemoval === editorState.currentContent) {
    return editorState;
  }

  return EditorState.push(editorState, afterRemoval, 'remove-range');
}

module.exports = keyCommandDeleteWord;
