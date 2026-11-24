import type { Editor } from '@tiptap/core';
import type { FormatCommand } from '../EditorCommandAdapter';
import { chooseImage } from './imageUploads';

export const formatters: Record<Exclude<FormatCommand, 'insertLink'>, (editor: Editor) => void> = {
  toggleTaskList: (editor) => editor.chain().focus().toggleTaskItem().run(),
  insertImage: chooseImage,
  toggleBold: (editor) => editor.chain().focus().toggleBold().run(),
  toggleItalic: (editor) => editor.chain().focus().toggleItalic().run(),
  toggleStrikethrough: (editor) => editor.chain().focus().toggleStrike().run(),
  toggleInlineCode: (editor) => editor.chain().focus().toggleCode().run(),
  toggleBlockquote: (editor) => editor.chain().focus().toggleBlockquote().run(),
  toggleBulletList: (editor) => editor.chain().focus().toggleBulletList().run(),
  toggleOrderedList: (editor) => editor.chain().focus().toggleOrderedList().run(),
  insertCodeBlock: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  insertDivider: (editor) => editor.chain().focus().setHorizontalRule().run(),
};
