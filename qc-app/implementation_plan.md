# [Phase 2] Governance Dashboard Fixes Implementation Plan

## User Review Required
> [!IMPORTANT]
> I will be adding a new component `WorkloadBalanceWidget` which was missing from the `components/governance` directory. I will also be redesigning the `governance/page.tsx` to include this widget and improve the overall layout.

## Proposed Changes

### Frontend Components (`apps/web/src/components/governance`)
#### [NEW] [WorkloadBalanceWidget.tsx](file:///d:/Claude/QC%20management%20tool/qc-app/apps/web/src/components/governance/WorkloadBalanceWidget.tsx)
- Implementation of the Workload Balance view as per Phase 2 Plan.
- Visualizes "Tasks vs Tests" ratio and coverage.

#### [MODIFY] [index.ts](file:///d:/Claude/QC%20management%20tool/qc-app/apps/web/src/components/governance/index.ts)
- Export the new widget.

### Frontend Pages
#### [MODIFY] [apps/web/app/governance/page.tsx](file:///d:/Claude/QC%20management%20tool/qc-app/apps/web/app/governance/page.tsx)
- **Style Overhaul**:
    - Implement a "modern dashboard" layout with properly spaced sections.
    - Use "Cards" for major sections (Heatmap, Risks, Workload).
    - Add a tabbed or stacked view if content is too long.
- **Functionality**:
    - Fetch Workload Balance data using `getWorkloadBalance`.
    - Fetch Quality Risks using `getQualityRisks` (already available in API).
    - Display the new `WorkloadBalanceWidget`.
    - Display `RiskIndicatorsWidget` (for top risks).

### API Services
#### [MODIFY] [apps/web/src/services/governanceApi.ts](file:///d:/Claude/QC%20management%20tool/qc-app/apps/web/src/services/governanceApi.ts)
- Ensure `getWorkloadBalance` and `getQualityRisks` are implemented and exported (checking file content next, but assuming standard service pattern).

## Verification Plan

### Automated Tests
- None currently set up for UI components.

### Manual Verification
1.  **Dashboard Load**: Open `http://localhost:3000/governance`.
2.  **Summary Cards**: Verify the top stats (Projects, Healthy, Critical, etc.) match the database.
3.  **Workload Widget**: Verify the "Workload Balance" section appears and shows bar/chart data for tasks vs tests.
4.  **Heatmap interaction**: Click a project in the heatmap and ensure it navigates to details.
5.  **Responsiveness**: Resize window to mobile width and verify layout stacks correctly.
