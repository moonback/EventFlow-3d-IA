"use client";
import { createContext, useContext } from "react";

/**
 * Mode courant de la scène, partagé avec les objets :
 * - `navigate` : cliquer sur un affichage (écran, post-it) ouvre la page liée (désactivé en agencement) ;
 * - `meeting` : une réunion est en cours dans la salle de réunion.
 */
export const SceneModeContext = createContext<{ navigate: boolean; meeting: boolean }>({ navigate: false, meeting: false });
export const useSceneMode = () => useContext(SceneModeContext);
