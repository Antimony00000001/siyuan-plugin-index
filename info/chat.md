# Codebase Optimization Analysis

## Current Status
- **File**: `src/events/protyle-event.ts`
- **Function**: `updateIndex` triggered by `loaded-protyle-static`.
- **Logic**: 
  1. Performs 1 combined SQL query to check for both Index and Outline blocks.
  2. Calls `autoUpdateIndex(..., indexBlock)` regardless of whether `indexBlock` was found.
  3. Calls `autoUpdateOutline(..., outlineBlock)` regardless of whether `outlineBlock` was found.

## The Issue (3 Queries in "Empty" Scenario)
When a document has **neither** an index nor an outline:
1. `updateIndex` executes Query #1 (Combined). Result: Empty.
2. `autoUpdateIndex` is called with `null`. It executes Query #2 (Fallback check). Result: Empty.
3. `autoUpdateOutline` is called with `null`. It executes Query #3 (Fallback check). Result: Empty.

**Total SQL Queries**: 3 (All checking for the same thing).

## Proposed Optimization
Only proceed with the update logic if the specific block was actually found in the initial combined query. The `autoUpdate...` functions are designed to *update existing* blocks, so calling them when nothing exists is redundant.

**Change in `src/events/protyle-event.ts`**:
```typescript
// ... query ...
if (indexBlock) {
    autoUpdateIndex(notebookId, path, parentId, indexBlock);
}
if (outlineBlock) {
    autoUpdateOutline(parentId, outlineBlock);
}
```

## Result
- **Scenario: Both exist**: 1 Query (unchanged, optimized path).
- **Scenario: None exist**: 1 Query (vs 3 previously).
- **Scenario: One exists**: 1 Query (vs 2 previously).

This strictly enforces the "Single Union Query" goal mentioned in documentation.