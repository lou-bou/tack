import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import styles from './DescriptionEditor.module.css';

class BulletWidget extends WidgetType {
  toDOM() {
    const dot = document.createElement('span');
    dot.className = styles.bullet ?? '';
    dot.textContent = '•';
    return dot;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  override eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = styles.task ?? '';
    box.setAttribute('aria-label', this.checked ? 'Done' : 'Not done');
    return box;
  }
  override ignoreEvent() {
    return false;
  }
}

const hide = Decoration.replace({});
const mark = (className?: string, attributes?: Record<string, string>) =>
  Decoration.mark({ class: className ?? '', attributes });
const lineClass = (className?: string) => Decoration.line({ class: className ?? '' });

const HEADING_CLASS: Record<string, string | undefined> = {
  ATXHeading1: styles.h1,
  ATXHeading2: styles.h2,
  ATXHeading3: styles.h3,
  ATXHeading4: styles.h4,
  ATXHeading5: styles.h4,
  ATXHeading6: styles.h4,
};

/** Line numbers holding the cursor, which show their raw Markdown so it can be edited. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

/**
 * Live preview: the document stays plain Markdown, and these only change how it's drawn. Markers
 * disappear except on the line being edited.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const { doc } = state;
  const active = activeLines(view);
  const ranges: Range<Decoration>[] = [];
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number);

  syntaxTree(state).iterate({
    enter(node) {
      const { name, from, to } = node;
      const heading = HEADING_CLASS[name];
      if (heading) {
        ranges.push(lineClass(heading).range(doc.lineAt(from).from));
        return;
      }
      switch (name) {
        case 'HeaderMark': {
          if (isActive(from)) return;
          // Takes the space after the #s too, so the text starts at the margin.
          const next = doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
          if (next > from) ranges.push(hide.range(from, next));
          return;
        }
        case 'StrongEmphasis':
          ranges.push(mark(styles.strong).range(from, to));
          return;
        case 'Emphasis':
          ranges.push(mark(styles.emphasis).range(from, to));
          return;
        case 'Strikethrough':
          ranges.push(mark(styles.struck).range(from, to));
          return;
        case 'InlineCode':
          ranges.push(mark(styles.code).range(from, to));
          return;
        case 'EmphasisMark':
        case 'CodeMark':
        case 'StrikethroughMark':
          // A fence's backticks stay, since a code block has nothing else to mark it.
          if (node.node.parent?.name === 'FencedCode' || isActive(from)) return;
          ranges.push(hide.range(from, to));
          return;
        case 'FencedCode':
          for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n += 1) {
            ranges.push(lineClass(styles.fence).range(doc.line(n).from));
          }
          return;
        case 'Link': {
          const url = node.node.getChild('URL');
          if (url) {
            ranges.push(
              mark(styles.link, { 'data-href': doc.sliceString(url.from, url.to) }).range(from, to),
            );
          }
          return;
        }
        case 'LinkMark':
        case 'URL':
          if (node.node.parent?.name !== 'Link' || isActive(from)) return;
          ranges.push(hide.range(from, to));
          return;
        case 'ListMark': {
          if (isActive(from)) return;
          const text = doc.sliceString(from, to);
          if (text !== '-' && text !== '*' && text !== '+') return;
          // A task's marker hides completely, because its checkbox stands in for the bullet.
          const isTask = node.node.parent?.getChild('Task') !== null;
          const end = doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
          ranges.push(
            isTask
              ? hide.range(from, end)
              : Decoration.replace({ widget: new BulletWidget() }).range(from, end),
          );
          return;
        }
        case 'TaskMarker': {
          if (isActive(from)) return;
          const checked = /x/i.test(doc.sliceString(from, to));
          ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(from, to));
          if (checked) ranges.push(lineClass(styles.taskDone).range(doc.lineAt(from).from));
          return;
        }
        case 'QuoteMark': {
          ranges.push(lineClass(styles.quote).range(doc.lineAt(from).from));
          if (isActive(from)) return;
          const end = doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
          ranges.push(hide.range(from, end));
          return;
        }
        default:
      }
    },
  });
  return Decoration.set(ranges, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
          event.preventDefault();
          const pos = view.posAtDOM(target);
          const text = view.state.doc.sliceString(pos, pos + 3);
          view.dispatch({
            changes: { from: pos, to: pos + 3, insert: /x/i.test(text) ? '[ ]' : '[x]' },
          });
          return true;
        }
        const link = target.closest<HTMLElement>('[data-href]');
        const href = link?.dataset.href;
        // On a line that's being edited, a click just places the cursor.
        if (href && /^(https?:|mailto:)/i.test(href)) {
          const line = view.state.doc.lineAt(view.posAtDOM(link));
          if (!activeLines(view).has(line.number)) {
            event.preventDefault();
            window.open(href, '_blank', 'noopener');
            return true;
          }
        }
        return false;
      },
    },
  },
);

export function createDescriptionEditor(options: {
  parent: HTMLElement;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        history(),
        keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Description' }),
        placeholder('Add a description'),
        livePreview,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
          if (update.focusChanged && !update.view.hasFocus) options.onBlur();
        }),
      ],
    }),
  });
}
