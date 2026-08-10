---
title: "When a Wildcard Join Multiplies Your Data (and How to Actually Fix It)"
date: 2026-08-10T10:00:00+07:00
draft: false
tags: ["sql", "sql-server", "performance"]
summary: "A join rule that matches 'anything' looks like an ordinary filter — until it quietly multiplies your row count. Measured, not estimated: what a wildcard join actually costs, why a CREATE INDEX line doesn't always buy you a seek, and why UNPIVOT beats a ten-way OR chain."
---

Picture two tables. One lists records to evaluate — accounts, orders,
whatever your domain is. The other lists rules, and a rule is allowed to
leave a field blank, meaning "this applies to everyone" rather than one
specific value. That's a completely reasonable design. Here's the join that
reads it:

```sql
-- a blank field on the rules side means "match anything here"
INSERT INTO #AccountCondition
SELECT ...
FROM #Accounts A
INNER JOIN #Rules R
  ON (A.RegionCode  = R.RegionCode  OR R.RegionCode  IS NULL)
 AND (A.SegmentCode = R.SegmentCode OR R.SegmentCode IS NULL)
```

Each "match this, or leave it blank" condition makes sense on its own. But
once a meaningful share of the rules leave a field blank, each of *those*
rules matches every account in the batch — not one, all of them. This isn't
a hypothetical. I ran it:

| Input | Result |
|---|---|
| 20,000 accounts, 4,000 rules (~28% of rules leave a field blank) | — |
| Rows produced by the join above | **646,400** |

32 rows per account, from a join that reads like an ordinary filter. Nobody
wrote a bug — every individual condition is correct. The multiplication is
emergent: a cartesian-style blowup that doesn't look like a mistake, it
looks like a normal join, right up until you count the rows.

646,400 rows alone usually isn't fatal — that's nothing for SQL Server. The
real damage happens once that oversized result feeds into cleanup logic
downstream.

## Give your staging table an index — then check what it actually bought you

A common next step: clean up that oversized result by deleting rows that
don't belong, checked against a lookup table.

```sql
DELETE tgt
FROM #AccountCondition tgt          -- no index: a heap
LEFT JOIN ScopeHierarchy H
  ON  ISNULL(tgt.ScopeCode, '*') = H.ScopeCode
  AND (tgt.SegmentCode = H.Level1
    OR tgt.SegmentCode = H.Level2
    OR ... -- through Level10
    )
WHERE H.ScopeCode IS NULL
```

The table holding those rows is a heap — no sort order, so finding anything
means checking every row. The obvious fix is an index:

```sql
CREATE CLUSTERED INDEX CIX ON #AccountCondition (ScopeCode, SegmentCode);
```

Here's the part worth actually checking, rather than assuming: does that
index get *used* the way you'd expect? I ran the delete above, indexed and
un-indexed, and pulled the real execution plan for each.

| Version | Time | vs. baseline | Plan shows |
|---|---|---|---|
| No index, `OR` chain (baseline) | 1,614.6 ms | — | Table Scan |
| + Index only, same `OR` chain | 852.4 ms | 1.89× | Clustered Index **Scan** |

Measured on 100,000 accounts, 20,000 rules, a 1,000-row hierarchy table —
16.16 million rows entering the delete.

The index made things faster — but the plan confirms it's still scanning
every row front to back, not seeking. That gap is the whole point of this
post.

> Wrapping a comparison in `ISNULL()` blocks SQL Server from using an index
> to jump straight to matching rows — it has to evaluate the function
> against every row instead. This is called **non-sargable**, and it's
> invisible unless you actually read the execution plan. A `CREATE INDEX`
> line is not proof that the index is being used the way you think.

The ~1.9× gain here came from the index reorganizing physical storage on
disk — a smaller, roughly constant win. The bigger prize, an actual seek,
needs one more change.

## Ten-way OR chains vs. UNPIVOT

The other half of that query checks one column against ten separate lookup
columns, because the hierarchy table was modeled wide instead of tall.
`UNPIVOT` turns that around — "one row, ten columns to compare" becomes "up
to ten rows, one column, seekable":

```sql
;WITH ScopeLevels AS (
  SELECT ScopeCode, LevelValue
  FROM ScopeHierarchy
  UNPIVOT (LevelValue FOR LevelCol IN (Level1, Level2, ..., Level10)) u
)
DELETE tgt
FROM #AccountCondition tgt
WHERE tgt.SegmentCode IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ScopeLevels s
    WHERE s.ScopeCode = ISNULL(tgt.ScopeCode, '*')
      AND s.LevelValue = tgt.SegmentCode
  );
```

I measured all four combinations on the same 16.16M-row input, not just the
two ends:

| Version | Time | vs. baseline |
|---|---|---|
| A — heap, `OR` chain, `ISNULL` (baseline) | 1,614.6 ms | 1.00× |
| B — indexed, `OR` chain, `ISNULL` | 852.4 ms | 1.89× |
| C — heap, `UNPIVOT` | 1,040.2 ms | 1.55× |
| D — indexed, `UNPIVOT` (both fixes) | 909.1 ms | 1.78× |

All four deleted the exact same rows — verified by comparing the remaining
row count afterward.

Notice B and D land close enough together that a single run each doesn't
support a clean ranking between them — that's noise, not a result, and I'm
not going to pretend otherwise. What the execution plan *does* confirm is
the part that matters: only the indexed-plus-`UNPIVOT` version is
structurally capable of a true index seek. A scan-based win like B is
roughly proportional to row count and flattens out; a seek keeps paying off
disproportionately as the table grows — which single-run numbers at one
fixed size can't show you by themselves. If this table is 16 million rows
today and 160 million next year, B and D stop being close.

Two more changes are worth doing even though I didn't isolate their timing
impact in this test: separate the wildcard rules from the specific rules
*before* the original join, so a "match anything" rule isn't physically
copied once per matching account. And filter the input down to what the
caller actually needs before handing it downstream — remove rows before the
multiplication happens, rather than cleaning them up after.

## Try it yourself

This script is self-contained — everything lives in temp tables that vanish
when your session ends. It builds the same 100,000-account / 20,000-rule /
1,000-row-hierarchy dataset used above and runs all four delete variants
back to back. Takes under a minute, most of it spent generating the data,
not running the deletes.

```sql
SET NOCOUNT ON;
DROP TABLE IF EXISTS #Accounts, #Rules, #ScopeHierarchy,
                      #P_Baseline, #P_IndexOnly, #P_UnpivotOnly, #P_Both;

-- 100,000 accounts, 20,000 rules (70% blank segment, 10% blank region,
-- 20% both set), a 1,000-row hierarchy table with 10 "level" columns.
;WITH n AS (
    SELECT TOP (100000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b CROSS JOIN sys.all_objects c
)
SELECT n AS RowNum, 'R' + CAST(n % 100 AS varchar(5)) AS RegionCode,
       'S' + CAST((n * 7) % 100 AS varchar(5)) AS SegmentCode
INTO #Accounts FROM n;

;WITH n AS (
    SELECT TOP (20000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b CROSS JOIN sys.all_objects c
)
SELECT n AS RuleID,
    CASE WHEN n >= 14000 AND n < 16000 THEN NULL ELSE 'R' + CAST(n % 100 AS varchar(5)) END AS RegionCode,
    CASE WHEN n < 14000 THEN NULL ELSE 'S' + CAST((n * 3) % 100 AS varchar(5)) END AS SegmentCode
INTO #Rules FROM n;

;WITH n AS (
    SELECT TOP (1000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
SELECT n AS HierarchyID, 'R' + CAST(n % 100 AS varchar(5)) AS ScopeCode,
    'S' + CAST(n % 100 AS varchar(5)) AS Level1, 'S' + CAST((n*3)%100 AS varchar(5)) AS Level2,
    'S' + CAST((n*7)%100 AS varchar(5)) AS Level3, 'S' + CAST((n*9)%100 AS varchar(5)) AS Level4,
    'S' + CAST((n*11)%100 AS varchar(5)) AS Level5, 'S' + CAST((n*13)%100 AS varchar(5)) AS Level6,
    'S' + CAST((n*17)%100 AS varchar(5)) AS Level7, 'S' + CAST((n*19)%100 AS varchar(5)) AS Level8,
    'S' + CAST((n*21)%100 AS varchar(5)) AS Level9, 'S' + CAST((n*23)%100 AS varchar(5)) AS Level10
INTO #ScopeHierarchy FROM n;

SELECT A.RowNum, A.RegionCode AS ScopeCode, A.SegmentCode
INTO #P_Baseline
FROM #Accounts A INNER JOIN #Rules R
    ON (A.RegionCode = R.RegionCode OR R.RegionCode IS NULL)
   AND (A.SegmentCode = R.SegmentCode OR R.SegmentCode IS NULL);

PRINT 'Rows entering the delete: ' + CAST(@@ROWCOUNT AS varchar(20));

SELECT * INTO #P_IndexOnly   FROM #P_Baseline;
SELECT * INTO #P_UnpivotOnly FROM #P_Baseline;
SELECT * INTO #P_Both        FROM #P_Baseline;

PRINT '--- A) heap, OR chain, ISNULL (baseline) ---';
SET STATISTICS TIME ON;
DELETE tgt FROM #P_Baseline tgt
LEFT JOIN #ScopeHierarchy H
    ON  ISNULL(tgt.ScopeCode, '*') = H.ScopeCode
    AND (tgt.SegmentCode = H.Level1  OR tgt.SegmentCode = H.Level2
      OR tgt.SegmentCode = H.Level3  OR tgt.SegmentCode = H.Level4
      OR tgt.SegmentCode = H.Level5  OR tgt.SegmentCode = H.Level6
      OR tgt.SegmentCode = H.Level7  OR tgt.SegmentCode = H.Level8
      OR tgt.SegmentCode = H.Level9  OR tgt.SegmentCode = H.Level10)
WHERE H.ScopeCode IS NULL;
SET STATISTICS TIME OFF;

PRINT '--- B) indexed, OR chain, ISNULL (index alone) ---';
CREATE CLUSTERED INDEX CIX ON #P_IndexOnly (ScopeCode, SegmentCode);
SET STATISTICS TIME ON;
DELETE tgt FROM #P_IndexOnly tgt
LEFT JOIN #ScopeHierarchy H
    ON  ISNULL(tgt.ScopeCode, '*') = H.ScopeCode
    AND (tgt.SegmentCode = H.Level1  OR tgt.SegmentCode = H.Level2
      OR tgt.SegmentCode = H.Level3  OR tgt.SegmentCode = H.Level4
      OR tgt.SegmentCode = H.Level5  OR tgt.SegmentCode = H.Level6
      OR tgt.SegmentCode = H.Level7  OR tgt.SegmentCode = H.Level8
      OR tgt.SegmentCode = H.Level9  OR tgt.SegmentCode = H.Level10)
WHERE H.ScopeCode IS NULL;
SET STATISTICS TIME OFF;

PRINT '--- C) heap, UNPIVOT (unpivot alone) ---';
SET STATISTICS TIME ON;
;WITH ScopeLevels AS (
    SELECT ScopeCode, LevelValue FROM #ScopeHierarchy
    UNPIVOT (LevelValue FOR LevelCol IN
        (Level1,Level2,Level3,Level4,Level5,Level6,Level7,Level8,Level9,Level10)) AS u
)
DELETE tgt FROM #P_UnpivotOnly tgt
WHERE tgt.SegmentCode IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ScopeLevels s
      WHERE s.ScopeCode = ISNULL(tgt.ScopeCode, '*') AND s.LevelValue = tgt.SegmentCode);
SET STATISTICS TIME OFF;

PRINT '--- D) indexed, UNPIVOT (both fixes) ---';
CREATE CLUSTERED INDEX CIX ON #P_Both (ScopeCode, SegmentCode);
SET STATISTICS TIME ON;
;WITH ScopeLevels AS (
    SELECT ScopeCode, LevelValue FROM #ScopeHierarchy
    UNPIVOT (LevelValue FOR LevelCol IN
        (Level1,Level2,Level3,Level4,Level5,Level6,Level7,Level8,Level9,Level10)) AS u
)
DELETE tgt FROM #P_Both tgt
WHERE tgt.SegmentCode IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ScopeLevels s
      WHERE s.ScopeCode = ISNULL(tgt.ScopeCode, '*') AND s.LevelValue = tgt.SegmentCode);
SET STATISTICS TIME OFF;

SELECT 'A baseline'    AS Version, COUNT(*) AS RowsRemaining FROM #P_Baseline
UNION ALL SELECT 'B index-only',   COUNT(*) FROM #P_IndexOnly
UNION ALL SELECT 'C unpivot-only', COUNT(*) FROM #P_UnpivotOnly
UNION ALL SELECT 'D both',         COUNT(*) FROM #P_Both;
-- All four RowsRemaining values should match exactly.
```

Requires SQL Server 2016+. Every object is a `#temp` table or CTE — nothing
touches a real database, safe to run anywhere.

## The lesson

A wildcard rule multiplies exactly, not gently, once both the rules table
and the data table grow — know your blank-field ratio before you trust a
row estimate. And an index can help even when it can't be seeked, but don't
stop there: wrapping a join column in a function blocks true seeking no
matter what indexes exist. Fix the predicate and the index together, and
check the actual execution plan rather than assuming a `CREATE INDEX` line
settled it.

That still leaves one more failure mode in this neighborhood: what actually
happens to a multi-step script's data when one step fails partway through —
covered in [the next post]({{< ref "sql-server-trustworthy-rollback-xact-abort" >}}).
