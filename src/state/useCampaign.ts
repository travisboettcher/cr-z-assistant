/**
 * The one way a component reaches campaign state.
 *
 * It hands back the state and `dispatch` — never a setter and never the
 * campaign object to mutate — so the only route from a click to a changed
 * campaign is an action through `campaignReducer`.
 */

import { useContext } from 'react';
import { CampaignContext } from './campaignContext';
import type { CampaignContextValue } from './campaignContext';

export function useCampaign(): CampaignContextValue {
  const value = useContext(CampaignContext);
  if (value === null) {
    throw new Error('useCampaign must be used inside a <CampaignProvider>');
  }
  return value;
}
