# Feature ownership experiment

## One-sentence rule

The PR description declares who contributed, Greptile checks the claim against the change, a human approves it, and deterministic code updates the feature ownership map.

## Authority boundaries

- The branch pusher, commit author, and PR author are provenance only. They receive no automatic ownership.
- The `pr-contribution/v1` block is the proposed split.
- The schema and catalog validator reject malformed shares, unknown people, unknown features, and feature-path mismatches.
- Greptile reviews whether the declaration is consistent with visible code and discussion. It does not calculate percentages or verify offline work.
- A non-contributor human reviewer approves the declaration.
- The append-only `ownership-event/v1` ledger is the system of record.
- Claude-mem receives a normalized post-merge observation for recall. Raw PR text is never injected into memory.

## Impact points

| Class | Points | Use |
| --- | ---: | --- |
| `patch` | 1 | Narrow fix or polish |
| `feature` | 3 | Meaningful user-facing behavior |
| `foundation` | 5 | New architecture or feature foundation |

For every feature named by a merged PR:

```text
contributor points = impact points × declared share
feature ownership = contributor cumulative points / all cumulative points
```

All shares are stored in basis points and normalized deterministically to exactly `10000`. Duplicate merge events are ignored by `event_id`.

## Claude-mem boundary

The local integration sends only validated IDs, shares, roles, approval, merge SHA, and Greptile status to Claude-mem. It deliberately excludes raw PR text to reduce persistent prompt-injection risk. Claude-mem is supporting recall, not the ownership database; if it is unavailable, ledger generation still succeeds.

Run `npm run ownership:remember` after recording an event on a workstation where the claude-mem worker is installed and healthy.
