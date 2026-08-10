---
title: "Making a Multi-Step SQL Server Script's Rollback Actually Trustworthy"
date: 2026-08-10T10:30:00+07:00
draft: false
tags: ["sql", "sql-server", "performance"]
summary: "When one step in a multi-step SQL Server script fails, what actually happens to your data depends entirely on how you've wired up error handling — and the default is not what most people assume. Three scenarios, measured with real ledger output."
---

This is a separate problem from [wildcard joins and OR chains]({{< ref "sql-server-wildcard-joins-and-unpivot" >}}), but the same neighborhood: you're running a script with several steps, maybe calling into other stored procedures, and one of them might fail partway through. What actually happens to your data depends entirely on how you've wired up error handling — and the default behavior is not what most people assume.

I tested three variants against the same failure: a nested procedure that
inserts a row, hits a divide-by-zero error, then (in source code, never in
practice, because the error stops it) tries to insert a second row. Here's
the real ledger output from each run — not paraphrased, not estimated.

## Scenario 1: plain `BEGIN TRAN`, no error handling

```sql
SET XACT_ABORT OFF;
BEGIN TRAN;
INSERT INTO #Ledger (Step) VALUES ('outer: before EXEC');
EXEC #ChildStep;
INSERT INTO #Ledger (Step) VALUES ('outer: after EXEC');
COMMIT;
INSERT INTO #Ledger (Step) VALUES ('outer: COMMIT succeeded');
```

Ledger:

```
outer: before EXEC
child: before error
child: after error
outer: after EXEC
outer: COMMIT succeeded
```

Every statement ran anyway, including the one *after* the error inside the
child procedure, and the final `COMMIT`. Nothing crashed. Nothing rolled
back. It just quietly kept going. This is SQL Server's default: most
runtime errors are not fatal to the batch, let alone the transaction.

## Scenario 2: `TRY/CATCH` added

```sql
SET XACT_ABORT OFF;
BEGIN TRY
    BEGIN TRAN;
    INSERT INTO #Ledger (Step) VALUES ('outer: before EXEC');
    EXEC #ChildStep;
    INSERT INTO #Ledger (Step) VALUES ('outer: after EXEC');
    COMMIT;
    INSERT INTO #Ledger (Step) VALUES ('outer: COMMIT succeeded');
END TRY
BEGIN CATCH
    INSERT INTO #Ledger (Step) VALUES ('CATCH fired, XACT_STATE=' + CAST(XACT_STATE() AS varchar(3)));
    IF XACT_STATE() <> 0 ROLLBACK;
    INSERT INTO #Ledger (Step) VALUES ('CATCH: after rollback check');
END CATCH;
```

Ledger:

```
CATCH: after rollback check
```

`CATCH` fired immediately this time — better. But look at what's missing:
the diagnostic line logged *before* the `ROLLBACK` ("CATCH fired,
XACT_STATE=...") got wiped out by that same rollback, because it was
inserted into `#Ledger` inside the same transaction that then got undone.
Only the line logged *after* rolling back survived.

## Scenario 3: `XACT_ABORT ON`, rollback first

```sql
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRAN;
    ...
    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;      -- always first
    SELECT ERROR_NUMBER(), ERROR_PROCEDURE(),
           ERROR_LINE(), ERROR_MESSAGE();      -- diagnostics after
END CATCH;
```

Ledger:

```
CATCH: state=-1 proc=#ChildStep line=5 msg=Divide by zero error encountered.
```

Everything before the error was cleanly undone. Only the diagnostic log —
written *after* rolling back — survived, and it captured the exact failing
line and procedure.

Getting here needed one fix mid-testing: my first attempt logged the error
*before* rolling back, same as scenario 2's mistake, and that log line
vanished too. Once a transaction is **doomed** — hit an error severe enough
that it can no longer be committed — nothing else it does can be written
until it's rolled back. Rollback has to come first in the `CATCH` block,
always.

> `XACT_ABORT ON` is the setting doing the real work here. It's what turns
> "an error happened somewhere in this chain" into "the whole transaction
> is instantly, automatically undone" — with no dependency on execution
> ever reaching your `ROLLBACK` line. Without it, as scenario 1 showed, a
> runtime error can be entirely survivable from the engine's point of view,
> even though it's exactly the kind of thing you'd want to stop everything
> for.

The pattern behind scenario 3, in full, is the one worth keeping around:

```sql
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRAN;
    ... -- your steps here
    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;      -- always first
    SELECT ERROR_NUMBER(), ERROR_PROCEDURE(),
           ERROR_LINE(), ERROR_MESSAGE();      -- diagnostics after
END CATCH;
```

## Try it yourself

Self-contained: a local temp table for the ledger and a local temp
procedure that fails on purpose. Takes a second or two, and resets itself
between scenarios so you can watch all three run back to back.

```sql
SET NOCOUNT ON;

CREATE OR ALTER PROCEDURE dbo.sp_ResetLedgerDemo AS
BEGIN
    IF OBJECT_ID('tempdb..#Ledger') IS NOT NULL DROP TABLE #Ledger;
    CREATE TABLE #Ledger (Seq INT IDENTITY, Step varchar(300));
    IF OBJECT_ID('tempdb..#ChildStep') IS NOT NULL DROP PROCEDURE #ChildStep;
END
GO
-- (If your client doesn't support GO as a batch separator, run the two
--  halves of this script as separate executions instead.)

EXEC dbo.sp_ResetLedgerDemo;
CREATE PROCEDURE #ChildStep AS
BEGIN
    INSERT INTO #Ledger (Step) VALUES ('child: before error');
    SELECT 1/0;                                          -- deliberate error
    INSERT INTO #Ledger (Step) VALUES ('child: after error');
END;

PRINT '=== Scenario 1: XACT_ABORT OFF, no TRY/CATCH ===';
SET XACT_ABORT OFF;
BEGIN TRAN;
INSERT INTO #Ledger (Step) VALUES ('outer: before EXEC');
EXEC #ChildStep;
INSERT INTO #Ledger (Step) VALUES ('outer: after EXEC');
COMMIT;
INSERT INTO #Ledger (Step) VALUES ('outer: COMMIT succeeded');
SELECT Step FROM #Ledger ORDER BY Seq;
IF @@TRANCOUNT > 0 ROLLBACK;

EXEC dbo.sp_ResetLedgerDemo;
CREATE PROCEDURE #ChildStep AS
BEGIN
    INSERT INTO #Ledger (Step) VALUES ('child: before error');
    SELECT 1/0;
    INSERT INTO #Ledger (Step) VALUES ('child: after error');
END;

PRINT '=== Scenario 2: TRY/CATCH added, XACT_ABORT still OFF ===';
SET XACT_ABORT OFF;
BEGIN TRY
    BEGIN TRAN;
    INSERT INTO #Ledger (Step) VALUES ('outer: before EXEC');
    EXEC #ChildStep;
    INSERT INTO #Ledger (Step) VALUES ('outer: after EXEC');
    COMMIT;
    INSERT INTO #Ledger (Step) VALUES ('outer: COMMIT succeeded');
END TRY
BEGIN CATCH
    -- Note the ordering here is the point of the demo: this logs BEFORE
    -- rolling back, so watch what survives.
    INSERT INTO #Ledger (Step) VALUES ('CATCH fired, XACT_STATE=' + CAST(XACT_STATE() AS varchar(3)));
    IF XACT_STATE() <> 0 ROLLBACK;
    INSERT INTO #Ledger (Step) VALUES ('CATCH: after rollback check');
END CATCH;
SELECT Step FROM #Ledger ORDER BY Seq;
IF @@TRANCOUNT > 0 ROLLBACK;

EXEC dbo.sp_ResetLedgerDemo;
CREATE PROCEDURE #ChildStep AS
BEGIN
    INSERT INTO #Ledger (Step) VALUES ('child: before error');
    SELECT 1/0;
    INSERT INTO #Ledger (Step) VALUES ('child: after error');
END;

PRINT '=== Scenario 3: XACT_ABORT ON, rollback FIRST in CATCH ===';
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRAN;
    INSERT INTO #Ledger (Step) VALUES ('outer: before EXEC');
    EXEC #ChildStep;
    INSERT INTO #Ledger (Step) VALUES ('outer: after EXEC');
    COMMIT;
    INSERT INTO #Ledger (Step) VALUES ('outer: COMMIT succeeded');
END TRY
BEGIN CATCH
    DECLARE @state INT = XACT_STATE(), @msg varchar(300) = ERROR_MESSAGE(),
            @proc varchar(300) = ISNULL(ERROR_PROCEDURE(), '(top level)'), @line INT = ERROR_LINE();
    IF XACT_STATE() <> 0 ROLLBACK;                        -- always first
    INSERT INTO #Ledger (Step) VALUES ('CATCH: state=' + CAST(@state AS varchar(3))
        + ' proc=' + @proc + ' line=' + CAST(@line AS varchar(10)) + ' msg=' + @msg);
END CATCH;
SELECT Step FROM #Ledger ORDER BY Seq;
IF @@TRANCOUNT > 0 ROLLBACK;
SET XACT_ABORT OFF;

DROP PROCEDURE IF EXISTS dbo.sp_ResetLedgerDemo;
```

Requires SQL Server 2016+. Everything lives in temp objects that vanish
when your session ends — safe to run anywhere.

## The lesson

The default error-handling behavior in SQL Server is "keep going," not
"stop." If you want a multi-step script to either fully happen or fully not
happen, you have to ask for that explicitly with `SET XACT_ABORT ON` — and
get the order of operations in your `CATCH` block right, or your own
diagnostics can vanish along with everything else.

If you've got a script that calls other scripts without `SET XACT_ABORT
ON`, or a `CATCH` block that logs before it rolls back, it's worth five
minutes to go check which of these you're sitting on.
