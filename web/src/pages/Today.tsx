import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { CardFace, CardSlot } from '../components/board/CardFace';
import { boardTitle } from '../lib/boards';
import { useToday } from '../lib/today';
import styles from './Today.module.css';

export function TodayPage() {
  const { groups, now, toggle } = useToday();
  return (
    <Screen title="Today">
      <div className={styles.column}>
        {groups?.length === 0 && <EmptyState message="Nothing due today." />}
        {groups?.map(({ board, rows }) => (
          <section key={board.id} className={styles.group} aria-label={board.name}>
            <h2 className={styles.heading}>
              <Link to={`/board/${board.id}`}>{boardTitle(board)}</Link>
            </h2>
            <ul>
              {rows.map(({ card, listName, leaving }) => (
                <li key={card.id} data-card-id={card.id}>
                  <CardSlot leaving={leaving}>
                    <CardFace
                      card={card}
                      now={now}
                      showCompleted
                      onToggle={toggle}
                      listName={listName}
                    />
                  </CardSlot>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Screen>
  );
}
