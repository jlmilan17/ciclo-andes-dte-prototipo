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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.rol) : '/login'} replace />;
}

const ADMIN = ['ADMIN'] as const;
const ALL = ['CAJERO', 'ADMIN'] as const;

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
                <Route
                  path="/resumen"
                  element={
                    <RequireRole roles={[...ADMIN]}>
                      <Placeholder title="Resumen" />
                    </RequireRole>
                  }
                />
                <Route
                  path="/pos"
                  element={
                    <RequireRole roles={[...ALL]}>
                      <Placeholder title="Punto de venta" />
                    </RequireRole>
                  }
                />
                <Route
                  path="/catalogo"
                  element={
                    <RequireRole roles={[...ADMIN]}>
                      <Placeholder title="Catálogo" />
                    </RequireRole>
                  }
                />
                <Route
                  path="/clientes"
                  element={
                    <RequireRole roles={[...ALL]}>
                      <Placeholder title="Clientes" />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dte"
                  element={
                    <RequireRole roles={[...ALL]}>
                      <Placeholder title="Historial de DTE" />
                    </RequireRole>
                  }
                />
                <Route
                  path="/contingencia"
                  element={
                    <RequireRole roles={[...ALL]}>
                      <Placeholder title="Contingencia" />
                    </RequireRole>
                  }
                />
                <Route
                  path="/usuarios"
                  element={
                    <RequireRole roles={[...ADMIN]}>
                      <Placeholder title="Usuarios y roles" />
                    </RequireRole>
                  }
                />
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
