/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+draft_js
 */

import React from 'react';
import Keys from 'fbjs/lib/Keys';
import UserAgent from 'fbjs/lib/UserAgent';
import KeyBindingUtil from '../../utils/KeyBindingUtil';
import {DraftEditorCommand} from '../../../model/constants/DraftEditorCommand';
import {
  EditorState,
  pushContent,
  redo,
} from '../../../model/immutable/EditorState';
import isEventHandled from '../../utils/isEventHandled';
import keyCommandPlainDelete from './commands/keyCommandPlainDelete';
import keyCommandDeleteWord from './commands/keyCommandDeleteWord';
import keyCommandPlainBackspace from './commands/keyCommandPlainBackspace';
import keyCommandBackspaceWord from './commands/keyCommandBackspaceWord';
import {keyCommandBackspaceToStartOfLine} from './commands/keyCommandBackspaceToStartOfLine';
import keyCommandInsertNewline from './commands/keyCommandInsertNewline';
import keyCommandTransposeCharacters from './commands/keyCommandTransposeCharacters';
import keyCommandMoveSelectionToStartOfBlock from './commands/keyCommandMoveSelectionToStartOfBlock';
import keyCommandMoveSelectionToEndOfBlock from './commands/keyCommandMoveSelectionToEndOfBlock';
import SecondaryClipboard from './commands/SecondaryClipboard';
import DraftEditor from '../../base/DraftEditor.react';
import DraftModifier from '../../../model/modifier/DraftModifier';
import keyCommandUndo from './commands/keyCommandUndo';

const {isOptionKeyCommand} = KeyBindingUtil;
const isChrome = UserAgent.isBrowser('Chrome');

/**
 * Map a `DraftEditorCommand` command value to a corresponding function.
 */
function onKeyCommand(
  command: DraftEditorCommand | string,
  editorState: EditorState,
  e: React.KeyboardEvent,
): EditorState {
  switch (command) {
    case 'redo':
      return redo(editorState);
    case 'delete':
      return keyCommandPlainDelete(editorState);
    case 'delete-word':
      return keyCommandDeleteWord(editorState);
    case 'backspace':
      return keyCommandPlainBackspace(editorState);
    case 'backspace-word':
      return keyCommandBackspaceWord(editorState);
    case 'backspace-to-start-of-line':
      return keyCommandBackspaceToStartOfLine(editorState, e);
    case 'split-block':
      return keyCommandInsertNewline(editorState);
    case 'transpose-characters':
      return keyCommandTransposeCharacters(editorState);
    case 'move-selection-to-start-of-block':
      return keyCommandMoveSelectionToStartOfBlock(editorState);
    case 'move-selection-to-end-of-block':
      return keyCommandMoveSelectionToEndOfBlock(editorState);
    case 'secondary-cut':
      return SecondaryClipboard.cut(editorState);
    case 'secondary-paste':
      return SecondaryClipboard.paste(editorState);
    default:
      return editorState;
  }
}

/**
 * Intercept keydown behavior to handle keys and commands manually, if desired.
 *
 * Keydown combinations may be mapped to `DraftCommand` values, which may
 * correspond to command functions that modify the editor or its contents.
 *
 * See `getDefaultKeyBinding` for defaults. Alternatively, the top-level
 * component may provide a custom mapping via the `keyBindingFn` prop.
 */
export function editOnKeyDown(
  editor: DraftEditor,
  e: React.KeyboardEvent,
): void {
  const keyCode = e.which;
  const editorState = editor._latestEditorState;
  function callDeprecatedHandler(
    handlerName:
      | 'onDownArrow'
      | 'onEscape'
      | 'onLeftArrow'
      | 'onRightArrow'
      | 'onTab'
      | 'onUpArrow',
  ): boolean {
    const deprecatedHandler = editor.props[handlerName];
    if (deprecatedHandler) {
      deprecatedHandler(e);
      return true;
    } else {
      return false;
    }
  }

  if (
    editor.props.handleKeyboardEvent &&
    isEventHandled(editor.props.handleKeyboardEvent(e))
  ) {
    return;
  }

  switch (keyCode) {
    case Keys.RETURN:
      e.preventDefault();
      // The top-level component may manually handle newline insertion. If
      // no special handling is performed, fall through to command handling.
      if (
        editor.props.handleReturn &&
        isEventHandled(editor.props.handleReturn(e, editorState))
      ) {
        return;
      }
      break;
    case Keys.ESC:
      e.preventDefault();
      if (callDeprecatedHandler('onEscape')) {
        return;
      }
      break;
    case Keys.TAB:
      if (callDeprecatedHandler('onTab')) {
        return;
      }
      break;
    case Keys.UP:
      if (callDeprecatedHandler('onUpArrow')) {
        return;
      }
      break;
    case Keys.RIGHT:
      if (callDeprecatedHandler('onRightArrow')) {
        return;
      }
      break;
    case Keys.DOWN:
      if (callDeprecatedHandler('onDownArrow')) {
        return;
      }
      break;
    case Keys.LEFT:
      if (callDeprecatedHandler('onLeftArrow')) {
        return;
      }
      break;
    case Keys.SPACE:
      // Prevent Chrome on OSX behavior where option + space scrolls.
      if (isChrome && isOptionKeyCommand(e)) {
        e.preventDefault();
      }
  }

  const command = editor.props.keyBindingFn(e);

  // If no command is specified, allow keydown event to continue.
  if (command == null || command === '') {
    if (keyCode === Keys.SPACE && isChrome && isOptionKeyCommand(e)) {
      // The default keydown event has already been prevented in order to stop
      // Chrome from scrolling. Insert a nbsp into the editor as OSX would for
      // other browsers.
      const contentState = DraftModifier.replaceText(
        editorState.currentContent,
        editorState.selection,
        '\u00a0',
      );
      editor.update(
        pushContent(editorState, contentState, 'insert-characters'),
      );
    }
    return;
  }

  if (command === 'undo') {
    // Since undo requires some special updating behavior to keep the editor
    // in sync, handle it separately.
    keyCommandUndo(e, editorState, editor.update);
    return;
  }

  // At this point, we know that we're handling a command of some kind, so
  // we don't want to insert a character following the keydown.
  e.preventDefault();

  // Allow components higher up the tree to handle the command first.
  if (
    editor.props.handleKeyCommand &&
    isEventHandled(
      editor.props.handleKeyCommand(command, editorState, e.timeStamp),
    )
  ) {
    return;
  }

  const newState = onKeyCommand(command, editorState, e);
  if (newState !== editorState) {
    editor.update(newState);
  }
}
