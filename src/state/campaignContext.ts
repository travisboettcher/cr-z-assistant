/**
 * The context object shared by `CampaignProvider` and `useCampaign`.
 *
 * Kept in its own module — and out of the provider's `.tsx` — so neither file
 * mixes a component export with a non-component one, which is what keeps React
 * Fast Refresh able to hot-swap the provider during `npm run dev`.
 */

import { createContext } from 'react';
import type { Dispatch } from 'react';
import type { CampaignAction, CampaignState } from './campaignStore';

export interface CampaignContextValue {
  readonly state: CampaignState;
  readonly dispatch: Dispatch<CampaignAction>;
}

/**
 * `null` rather than a working default: a component rendered outside the
 * provider would otherwise dispatch into a void and appear to do nothing, which
 * is far harder to diagnose than the error `useCampaign` throws.
 */
export const CampaignContext = createContext<CampaignContextValue | null>(null);
