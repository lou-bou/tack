import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { CardPanel } from './components/panel/CardPanel';
import { Splash } from './components/Splash';
import { ToastProvider } from './components/Toast';
import { CardPanelProvider } from './lib/cardPanel';
import { UnsentProvider } from './lib/unsent';
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
        <CardPanelProvider>
          <UnsentProvider>
            <AppShell>
              <Routes>
                <Route path="/board/:boardId" element={<BoardPage />} />
                <Route path="/today" element={<TodayPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<BoardsPage />} />
              </Routes>
            </AppShell>
            <CardPanel />
          </UnsentProvider>
        </CardPanelProvider>
        <Splash />
      </ToastProvider>
    </BrowserRouter>
  );
}
