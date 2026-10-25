import { Outlet } from 'react-router-dom';
import { Rail } from './Rail';
import { ShellCtx } from './shellContext';
import { TopBar } from './TopBar';

export function Shell() {
  return (
    <ShellCtx.Provider value={{ turnoAbierto: false, cajaCodigo: null }}>
      <div className="flex h-screen overflow-hidden">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </ShellCtx.Provider>
  );
}
