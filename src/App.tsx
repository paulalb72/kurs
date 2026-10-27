import { useEffect, useState } from 'react';
import { Sidebar, type View } from './components/Sidebar';
import { ModalHost, PanelHost, Toast } from './components/Hosts';
import { Today } from './views/Today';
import { Week } from './views/Week';
import { Goals } from './views/Goals';

const VIEWS: View[] = ['heute', 'woche', 'ziele'];
const readView = (): View => {
  const hash = window.location.hash.slice(1) as View;
  return VIEWS.includes(hash) ? hash : 'heute';
};

export default function App() {
  const [view, setView] = useState<View>(readView);

  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <Sidebar view={view} />
      <main className="main">
        {view === 'heute' && <Today />}
        {view === 'woche' && <Week />}
        {view === 'ziele' && <Goals />}
      </main>
      <PanelHost />
      <ModalHost />
      <Toast />
    </div>
  );
}
