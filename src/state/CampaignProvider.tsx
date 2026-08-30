/**
 * Wires the pure reducer into React. This is the only place `campaignReducer`
 * meets a component: everything below reads state and dispatches actions, and
 * nothing below writes campaign state itself.
 */

import { useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { CampaignContext } from './campaignContext';
import { INITIAL_CAMPAIGN_STATE, campaignReducer } from './campaignStore';
import type { CampaignState } from './campaignStore';

export interface CampaignProviderProps {
  readonly children: ReactNode;
  /**
   * Starting state, defaulting to "nothing open". Injectable so tests — and
   * later the localStorage restore in Z0-10 — can boot the app with a campaign
   * already loaded without dispatching a synthetic action first.
   */
  readonly initialState?: CampaignState;
}

export function CampaignProvider({
  children,
  initialState = INITIAL_CAMPAIGN_STATE,
}: CampaignProviderProps) {
  const [state, dispatch] = useReducer(campaignReducer, initialState);

  // `dispatch` is stable, so the value only changes when the state does —
  // without this every consumer re-renders on every parent render.
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <CampaignContext value={value}>{children}</CampaignContext>;
}
