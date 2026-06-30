# Business Workflows

## Primary Workflow: Release Readiness

```mermaid
flowchart TD
    A[QA Lead reviews dashboard] --> B[Check pass rate, coverage, execution freshness]
    B --> C[Review quality gate evaluation]
    C --> D{Quality gates pass?}
    D -->|Yes| E[Approve release]
    D -->|No| F[Block release with findings]
    E --> G[Share release readiness report]
    F --> G
```

## Secondary Workflow: Quality Health Monitoring

```mermaid
flowchart TD
    A[Monitor trends across projects] --> B[Identify coverage gaps]
    B --> C[Detect execution risks early]
    C --> D[Track workload vs quality health]
    D --> A
```

## Test Execution Workflow

```mermaid
flowchart TD
    A[Test Lead creates test run] --> B[Assign test cases to testers]
    B --> C[Testers execute test cases]
    C --> D[Record results: pass/fail/blocked]
    D --> E[Upload results batch]
    E --> F[Quality metrics update automatically]
    F --> G[Dashboard reflects latest quality state]
```

## Bug Lifecycle

```mermaid
flowchart TD
    A[Bug discovered] --> B{Source?}
    B -->|Test Case execution| C[Link to test case]
    B -->|Exploratory testing| D[Create standalone bug]
    C --> E[Log bug with severity]
    D --> E
    E --> F[Link to artifact: task/user story]
    F --> G[Triage and assign]
    G --> H[Fix and verify]
    H --> I[Close bug]
```

## Tuleap Integration Workflow

```mermaid
flowchart TD
    A[Tuleap artifact change] --> B[n8n webhook receives event]
    B --> C[n8n transforms to Unified Payload]
    C --> D[POST /api/tuleap-webhook/unified]
    D --> E{Persister processes}
    E -->|sync action| F[Upsert QC artifact]
    E -->|delete action| G[Soft-delete QC artifact]
    E -->|reject action| H[Log to task history, skip creation]
    E -->|archive action| I[Archive to history, soft-delete]
```

## Task Assignment Workflow

```mermaid
flowchart TD
    A[Task created/updated] --> B[Assign primary resource]
    B --> C[Optional: assign secondary resources]
    C --> D[Set per-person estimates]
    D --> E[Work tracked via actual_hrs]
    E --> F[On close: calculate estimate accuracy per assignment]
```
