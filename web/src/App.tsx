import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { useApplyAppearance } from './lib/appearance';
import { BoardPage } from './pages/Board';
import { BoardsPage } from './pages/Boards';
import { CalendarPage } from './pages/Calendar';
import { SettingsPage } from './pages/Settings';
import { TodayPage } from './pages/Today';

export function App() {
  useApplyAppearance();
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell>
          <Routes>
            <Route path="/board/:boardId" element={<BoardPage />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<BoardsPage />} />
          </Routes>
        </AppShell>
      </ToastProvider>
    </BrowserRouter>
  );
}
