import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { Componentes } from './pages/dev/Componentes';

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/dev/componentes" element={<Componentes />} />
          <Route path="*" element={<main className="p-8">Ciclo Andes · Prototipo DTE</main>} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
