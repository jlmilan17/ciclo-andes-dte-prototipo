import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, homeFor, useAuth } from './auth/AuthContext';
import { RequireAuth, RequireRole } from './auth/guards';
import { ToastProvider } from './components/Toast';
import { SesionExpirada } from './layout/SesionExpirada';
import { Shell } from './layout/Shell';
import { AccesoDenegado } from './pages/auth/AccesoDenegado';
import { Login } from './pages/auth/Login';
import { MiPerfil } from './pages/auth/MiPerfil';
import { SelectorRol } from './pages/auth/SelectorRol';
import { Componentes } from './pages/dev/Componentes';
import { Placeholder } from './pages/Placeholder';
import { ROUTES } from './routes/table';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.rol) : '/login'} replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/demo/roles" element={<SelectorRol />} />
              <Route path="/dev/componentes" element={<Componentes />} />
              <Route
                element={
                  <RequireAuth>
                    <Shell />
                  </RequireAuth>
                }
              >
                <Route index element={<Home />} />
                <Route path="/perfil" element={<MiPerfil />} />
                {ROUTES.map((r) => (
                  <Route
                    key={r.path}
                    path={r.path}
                    element={<RequireRole roles={r.roles}>{r.element}</RequireRole>}
                  />
                ))}
                <Route path="/acceso-denegado" element={<AccesoDenegado />} />
                <Route path="*" element={<Placeholder title="Página no encontrada" />} />
              </Route>
            </Routes>
            <SesionExpirada />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
