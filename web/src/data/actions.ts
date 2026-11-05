import {
  byPosition,
  cardRestorePlan,
  newId,
  positionAtEnd,
  type BoardColor,
  type BoardFields,
  type CardFields,
  type ListFields,
  type TrashKind,
} from '@tack/shared';
import { db, store } from './index';

const timestamps = () => {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now, deletedAt: null };
};

export async function createBoard(input: {
  name: string;
  emoji: string | null;
  color: BoardColor;
}): Promise<string> {
  const id = newId();
  const boards = (await db.boards.toArray()).sort(byPosition);
  await store.insert('boards', id, {
    ...input,
    showCompleted: false,
    position: positionAtEnd(boards),
    ...timestamps(),
  });
  return id;
}

export const updateBoard = (id: string, fields: Partial<BoardFields>) =>
  store.update('boards', id, fields);

export const trashBoard = (id: string) =>
  store.update('boards', id, { deletedAt: new Date().toISOString() });

export const restoreBoard = (id: string) => store.update('boards', id, { deletedAt: null });

export async function createList(boardId: string, name: string): Promise<string> {
  const id = newId();
  const lists = (await db.lists.where('boardId').equals(boardId).toArray()).sort(byPosition);
  await store.insert('lists', id, {
    boardId,
    name,
    position: positionAtEnd(lists),
    ...timestamps(),
  });
  return id;
}

export const updateList = (id: string, fields: Partial<ListFields>) =>
  store.update('lists', id, fields);

export const trashList = (id: string) =>
  store.update('lists', id, { deletedAt: new Date().toISOString() });

export const restoreList = (id: string) => store.update('lists', id, { deletedAt: null });

export async function createCard(
  boardId: string,
  listId: string,
  title: string,
  extra: Partial<Pick<CardFields, 'due'>> = {},
): Promise<string> {
  const id = newId();
  const cards = (await db.cards.where('listId').equals(listId).toArray()).sort(byPosition);
  await store.insert('cards', id, {
    boardId,
    listId,
    position: positionAtEnd(cards),
    title,
    description: '',
    start: null,
    due: null,
    priority: 'none',
    completed: false,
    completedAt: null,
    ...timestamps(),
    ...extra,
  });
  return id;
}

export const updateCard = (id: string, fields: Partial<CardFields>) =>
  store.update('cards', id, fields);

export const setCardCompleted = (id: string, completed: boolean) =>
  store.update('cards', id, {
    completed,
    completedAt: completed ? new Date().toISOString() : null,
  });

export const trashCard = (id: string) =>
  store.update('cards', id, { deletedAt: new Date().toISOString() });

export const restoreCard = (id: string) => store.update('cards', id, { deletedAt: null });

/** Brings an item back from Trash. Lists and boards bring their cards with them. */
export async function restoreFromTrash(kind: TrashKind, id: string): Promise<void> {
  if (kind === 'board') return void (await restoreBoard(id));
  if (kind === 'list') return void (await restoreList(id));

  const card = await db.cards.get(id);
  if (!card) return;
  const lists = await db.lists.where('boardId').equals(card.boardId).toArray();
  const plan = cardRestorePlan(card, lists);
  if (plan.kind === 'inPlace') return void (await restoreCard(id));

  const listId = plan.kind === 'moveTo' ? plan.listId : await createList(card.boardId, 'Restored');
  const siblings = (await db.cards.where('listId').equals(listId).toArray()).sort(byPosition);
  await store.update('cards', id, {
    listId,
    position: positionAtEnd(siblings),
    deletedAt: null,
  });
}

const TABLE_OF = { board: 'boards', list: 'lists', card: 'cards' } as const;

export const purgeForever = (kind: TrashKind, id: string) => store.purge(TABLE_OF[kind], id);
