# Project Roadmap - Dashboard Enhancements

## Phase 1: Dynamic Views & Filtering
- **Goal**: Replace static "high-priority/late" views with a flexible system.
- **Features**:
  - Dropdown to select task attributes (e.g., Status, Priority, Assignee).
  - "Save Filter" button to persist custom views.
  - Quick-access list for saved filters.

## Phase 2: Enhanced Visualization & Animation
- **Goal**: Make the dashboard more engaging and accurate.
- **Features**:
  - Add entry animations for charts and cards (e.g., fade-in, slide-up).
  - **Tasks per Project Bar Logic**:
    - 0 tasks: Empty/Hidden.
    - 1-9 tasks: Proportional width (scaled 10% per task).
    - 10+ tasks: Full width (100%).

## Phase 3: Resource Utilization & Statistics
- **Goal**: Provide insights into team performance and workload.
- **Features**:
  - **Utilization Chart**: Visual representation of resource allocation.
  - **Resource Statistics Section**:
    - Filter by Resource and Month.
    - **Metrics**:
      - Finished Tasks Count.
      - Efficiency Score: `IF(Total Actual > 0, Total Estimation / Total Actual, 0)`.

## Phase 4: Task Table Cleanup
- **Goal**: Simplify task tracking and improve data quality.
- **Features**:
  - Remove "Progress" column.
  - Populate with fresh, realistic test data for verification.
