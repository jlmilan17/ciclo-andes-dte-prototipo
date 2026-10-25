import { createContext, useContext } from 'react';

export type ShellState = { turnoAbierto: boolean; cajaCodigo: string | null };

export const ShellCtx = createContext<ShellState>({ turnoAbierto: false, cajaCodigo: null });
export const useShell = () => useContext(ShellCtx);
