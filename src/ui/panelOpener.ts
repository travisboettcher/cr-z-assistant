/**
 * How a screen inside the turn opens one of the community modals — provided by
 * `App`, read by `OpenPanel`. `null` outside the app, where there is nothing to
 * open.
 */

import { createContext } from 'react';
import type { CommunityPanel } from './CommunitySummary';

export const PanelOpener = createContext<((panel: CommunityPanel) => void) | null>(null);
