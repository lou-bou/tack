import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';

export function TodayPage() {
  return (
    <Screen title="Today">
      <EmptyState message="Today isn't built yet." />
    </Screen>
  );
}
