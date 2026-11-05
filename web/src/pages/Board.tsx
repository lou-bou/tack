import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { db } from '../data';

export function BoardPage() {
  const { boardId = '' } = useParams();
  // Null once loaded and missing, so a slow read doesn't flash "not found".
  const board = useLiveQuery(async () => (await db.boards.get(boardId)) ?? null, [boardId]);

  if (board === undefined) return <Screen title="" />;
  if (board === null || board.deletedAt) {
    return (
      <Screen title="Board not found">
        <EmptyState
          message="This board doesn't exist or is in Trash."
          action={<Link to="/">Back to boards</Link>}
        />
      </Screen>
    );
  }
  return (
    <Screen title={board.emoji ? `${board.emoji} ${board.name}` : board.name}>
      <EmptyState message="The board view isn't built yet." />
    </Screen>
  );
}
