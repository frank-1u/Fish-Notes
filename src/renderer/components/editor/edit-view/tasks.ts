import {
  InputRule,
  type JSONContent,
  type MarkdownRendererHelpers,
  type RenderContext,
} from '@tiptap/core';
import { BulletList, ListItem, OrderedList, TaskItem } from '@tiptap/extension-list';
import { joinBlocks } from './noteSource';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskItem: { toggleTaskItem: () => ReturnType };
  }
}

function renderListItem(
  node: JSONContent,
  helpers: MarkdownRendererHelpers,
  context: RenderContext,
) {
  const start = context.meta?.parentAttrs?.start ?? 1;
  const marker = context.parentType === 'orderedList' ? `${start + context.index}. ` : '- ';
  const checkbox = node.type === 'taskItem' ? (node.attrs?.checked ? '[x] ' : '[ ] ') : '';
  const text = joinBlocks(node.content ?? [], (block) => helpers.renderChildren([block]), true);
  return marker + checkbox + text.replace(/\n(?=[^\n])/g, '\n' + ' '.repeat(marker.length));
}

// GFM checkboxes belong to individual items. Ordinary bullets and tasks can
// share a list, including its nesting, numbering and continuation paragraphs.
const listContent = '(listItem | taskItem)+';
export const taskLists = [
  ListItem.extend({ renderMarkdown: renderListItem }),
  BulletList.extend({ content: listContent }),
  OrderedList.extend({ content: listContent }),
  TaskItem.extend({
    addCommands() {
      return {
        toggleTaskItem:
          () =>
          ({ chain, tr, state }) => {
            if (!this.editor.isActive('listItem') && !this.editor.isActive('taskItem')) {
              if (!chain().toggleBulletList().run()) return false;
            }
            const pos = tr.selection.$from;
            for (let depth = pos.depth; depth > 0; depth--) {
              const name = pos.node(depth).type.name;
              if (name === 'taskItem' || name === 'listItem') {
                tr.setNodeMarkup(
                  pos.before(depth),
                  state.schema.nodes[name === 'taskItem' ? 'listItem' : 'taskItem'],
                );
                return true;
              }
            }
            return false;
          },
      };
    },
    parseMarkdown(token, helpers) {
      const content = helpers.parseChildren(token.tokens ?? []);
      if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
      return { type: 'taskItem', attrs: { checked: token.checked }, content };
    },
    renderMarkdown: renderListItem,
    addInputRules() {
      return [
        new InputRule({
          find: /^\[([ xX])\] $/,
          handler: ({ state, range, match }) => {
            // The "- " input rule has already created the enclosing bullet.
            const pos = state.doc.resolve(range.from);
            if (pos.depth < 2 || pos.node(-1).type.name !== 'listItem' || pos.index(-1) !== 0)
              return null;
            state.tr.delete(range.from, range.to).setNodeMarkup(pos.before(-1), this.type, {
              checked: match[1].toLowerCase() === 'x',
            });
          },
        }),
      ];
    },
  }).configure({
    nested: true,
    taskListTypeName: 'bulletList',
    a11y: {
      checkboxLabel: (node) => node.textContent || '[ ]',
    },
  }),
];
