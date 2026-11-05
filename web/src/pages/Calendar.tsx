import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';

export function CalendarPage() {
  return (
    <Screen title="Calendar">
      <EmptyState message="The calendar isn't built yet." />
    </Screen>
  );
}
