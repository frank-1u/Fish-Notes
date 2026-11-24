export type FormatCommand =
  | 'toggleBold'
  | 'toggleItalic'
  | 'toggleStrikethrough'
  | 'toggleBlockquote'
  | 'insertLink'
  | 'toggleInlineCode'
  | 'insertCodeBlock'
  | 'toggleBulletList'
  | 'toggleOrderedList'
  | 'toggleTaskList'
  | 'insertImage'
  | 'insertDivider';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface EditorCommandAdapter {
  format(command: FormatCommand): void;
  toggleHeading(level: HeadingLevel): void;
  insertTable(rows: number, columns: number): void;
}
