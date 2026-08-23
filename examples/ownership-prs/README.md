# Example ownership PRs

These three descriptions model PRs pushed by the same `demo-bot` account. Credit comes only from the validated contribution block:

| Merge | Declared contribution | Search ownership after merge |
| --- | --- | --- |
| `01-discover-foundation.md` | Aanish 60%, Bill 40% of a 5-point foundation | Aanish 60%, Bill 40% |
| `02-discover-wraparound-fix.md` | Bill 100% of a 1-point patch | Aanish 50%, Bill 50% |
| `03-ai-ranking.md` | Claude 100% of a 3-point feature | Aanish 33.34%, Bill 33.33%, Claude 33.33% |

Validate any example with:

```bash
npm run ownership:validate -- \
  --body-file examples/ownership-prs/01-discover-foundation.md \
  --changed-files examples/ownership-prs/search-changed-files.txt
```

Rebuild the cumulative map with:

```bash
npm run ownership:rebuild
```
