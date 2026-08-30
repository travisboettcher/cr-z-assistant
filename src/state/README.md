# `src/state` — the campaign store

One reducer over `Campaign`, plus the provider and hook that wire it into React.
**Every state change goes through an action.** A component reads state and dispatches;
it never holds a setter and never writes to a campaign.

`campaignStore.ts` is a plain function — no React import, no DOM — so it is tested directly.
`campaignContext.ts`, `CampaignProvider.tsx` and `useCampaign.ts` are the React binding and
contain no logic of their own.

This is the structural answer to the failure mode that stalled the July 2025 attempt: rules
living inside DOM-update functions. Anything that would otherwise be tempting to write in an
event handler either becomes an action here or a pure function in `src/engine`.

**No rules live here.** The reducer only sets fields that already exist on `Campaign` — it
computes nothing, caches nothing derived, and makes no claim about how a turn or a phase
progresses. Impure inputs (a fresh id, the current time) arrive on the action, captured by
the caller, so the reducer stays deterministic.
