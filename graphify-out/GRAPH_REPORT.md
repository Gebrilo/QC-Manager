# Graph Report - .  (2026-05-16)

## Corpus Check
- 385 files · ~481,405 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 864 nodes · 1021 edges · 155 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `getManagerTeamId()` - 9 edges
2. `showError()` - 9 edges
3. `showErrorMsg()` - 8 edges
4. `showSuccess()` - 8 edges
5. `showSuccessMsg()` - 7 edges
6. `loadTeamDetails()` - 7 edges
7. `capitalCase()` - 6 edges
8. `lifecycleError()` - 6 edges
9. `FieldRegistry` - 6 edges
10. `getStorageClient()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `confirmDelete()` --calls--> `loadResources()`  [EXTRACTED]
  apps/web/app/my-tasks/page.tsx → apps/web/app/resources/page.tsx
- `confirmDelete()` --calls--> `loadJourneys()`  [EXTRACTED]
  apps/web/app/my-tasks/page.tsx → apps/web/app/settings/journeys/page.tsx
- `confirmDelete()` --calls--> `showSuccess()`  [EXTRACTED]
  apps/web/app/my-tasks/page.tsx → apps/web/app/settings/teams/page.tsx
- `confirmDelete()` --calls--> `showError()`  [EXTRACTED]
  apps/web/app/my-tasks/page.tsx → apps/web/app/settings/teams/page.tsx
- `handleCreate()` --calls--> `loadJourneys()`  [EXTRACTED]
  apps/web/app/settings/teams/page.tsx → apps/web/app/settings/journeys/page.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (39): buildTaskQuery(), closeModal(), confirmDelete(), confirmDeleteProject(), fetchPermissions(), getAuthHeaders(), handleAddMember(), handleAssignProject() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (2): handleSave(), loadGates()

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (8): addFilter(), applyView(), dispatchFilterUpdate(), handleSearchChange(), removeFilter(), handleDelete(), handleSubmit(), loadComments()

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (14): handleSubmit(), loadData(), findNodePath(), getBreadcrumbs(), getLandingPage(), getRouteConfig(), getStatus(), hasCatalogPermission() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (2): handleGenerate(), pollJobStatus()

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (0): 

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (2): mockAuthenticatedSession(), seedAuth()

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (6): buildActivityQuery(), csvParam(), parseActivityFilters(), setCsvParam(), setScalarParam(), writeActivityFiltersToParams()

### Community 8 - "Community 8"
Cohesion: 0.26
Nodes (9): attachTeamScope(), canAccessProject(), canAccessTask(), canAccessTeamMember(), canAccessUser(), getManagerTeam(), getManagerTeamId(), getTeamScopeFilter() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (2): applyStatus(), toggleDone()

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (10): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), generateTaskId(), handleArchive(), handleDelete(), handleReject() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (4): buildPlanDetail(), buildProgress(), getPlanForUser(), getPlanForUserOrId()

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (7): capitalCase(), generateApiFixture(), generateAuthTest(), generateCrudTest(), generatePageModel(), main(), parseArgs()

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (7): canUserPerform(), canUserUseScope(), collectRolePermissions(), collectRoleScopes(), isKnownPermissionKey(), normalizeOverrideMap(), resolvePermissionKey()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (9): applyValueMap(), buildTuleapValues(), createBug(), dispatchAction(), emitToTuleap(), handleDelete(), handleSync(), resolveLinkedIds() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.43
Nodes (7): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), handleDelete(), handleSync(), updateUserStory()

### Community 17 - "Community 17"
Cohesion: 0.43
Nodes (7): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), generateTestCaseId(), handleDelete(), handleSync()

### Community 18 - "Community 18"
Cohesion: 0.62
Nodes (6): addWorkingDays(), computeTaskTimeline(), countWorkingDays(), getTaskHealth(), isWorkingDay(), normalizeDate()

### Community 19 - "Community 19"
Cohesion: 0.52
Nodes (6): activateUser(), archiveUser(), lifecycleError(), markReadyForActivation(), rollbackUser(), suspendUser()

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (2): getTaskListFilters(), parseCsvParam()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (2): resolveConfig(), resolveTrackerId()

### Community 22 - "Community 22"
Cohesion: 0.43
Nodes (1): FieldRegistry

### Community 23 - "Community 23"
Cohesion: 0.52
Nodes (6): applyFieldMappings(), applyStatusMap(), fromTuleap(), getEffectiveMapping(), reverseStatusMap(), toTuleap()

### Community 24 - "Community 24"
Cohesion: 0.52
Nodes (6): createSignedUrl(), deleteFile(), downloadFile(), ensureBucketExists(), getStorageClient(), uploadFile()

### Community 25 - "Community 25"
Cohesion: 0.6
Nodes (5): checkDependency(), checkDevServer(), checkDirectory(), checkFile(), main()

### Community 26 - "Community 26"
Cohesion: 0.47
Nodes (3): handleTestSpriteWebhook(), parseTestSpriteResults(), uploadTestSpriteResults()

### Community 27 - "Community 27"
Cohesion: 0.6
Nodes (5): buildBugPayload(), buildTaskPayload(), buildTestCasePayload(), buildUserStoryPayload(), required()

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 0.7
Nodes (4): getKey(), normalize(), valueFromBindIds(), valueFromInlineValues()

### Community 31 - "Community 31"
Cohesion: 0.4
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.4
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 0.5
Nodes (2): downloadCSV(), triggerBlobDownload()

### Community 34 - "Community 34"
Cohesion: 0.5
Nodes (1): ProjectPage

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (1): LoginPage

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (1): TaskBoard

### Community 37 - "Community 37"
Cohesion: 0.83
Nodes (3): buildCommand(), main(), parseArgs()

### Community 38 - "Community 38"
Cohesion: 0.83
Nodes (3): createDirectory(), createFile(), main()

### Community 39 - "Community 39"
Cohesion: 0.83
Nodes (3): createMockAuditLog(), createMockPool(), setupTestApp()

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (2): createTuleapClient(), get()

### Community 43 - "Community 43"
Cohesion: 0.5
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 0.83
Nodes (3): extractPermissionReferences(), validatePermissionCatalog(), walkJavaScriptFiles()

### Community 46 - "Community 46"
Cohesion: 0.5
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (2): escapeHtml(), generateProjectSummaryHTML()

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): log(), validateWorkflow()

### Community 49 - "Community 49"
Cohesion: 0.67
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (2): makeRes(), runMiddleware()

### Community 51 - "Community 51"
Cohesion: 0.67
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (2): createNotification(), notifyAdmins()

### Community 56 - "Community 56"
Cohesion: 0.67
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 0.67
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 0.67
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (2): GET(), getOrigin()

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (0): 

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (0): 

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (0): 

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (0): 

### Community 96 - "Community 96"
Cohesion: 1.0
Nodes (0): 

### Community 97 - "Community 97"
Cohesion: 1.0
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 1.0
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (0): 

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (0): 

### Community 102 - "Community 102"
Cohesion: 1.0
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (0): 

### Community 104 - "Community 104"
Cohesion: 1.0
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 1.0
Nodes (0): 

### Community 106 - "Community 106"
Cohesion: 1.0
Nodes (0): 

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (0): 

### Community 108 - "Community 108"
Cohesion: 1.0
Nodes (0): 

### Community 109 - "Community 109"
Cohesion: 1.0
Nodes (0): 

### Community 110 - "Community 110"
Cohesion: 1.0
Nodes (0): 

### Community 111 - "Community 111"
Cohesion: 1.0
Nodes (0): 

### Community 112 - "Community 112"
Cohesion: 1.0
Nodes (0): 

### Community 113 - "Community 113"
Cohesion: 1.0
Nodes (0): 

### Community 114 - "Community 114"
Cohesion: 1.0
Nodes (0): 

### Community 115 - "Community 115"
Cohesion: 1.0
Nodes (0): 

### Community 116 - "Community 116"
Cohesion: 1.0
Nodes (0): 

### Community 117 - "Community 117"
Cohesion: 1.0
Nodes (0): 

### Community 118 - "Community 118"
Cohesion: 1.0
Nodes (0): 

### Community 119 - "Community 119"
Cohesion: 1.0
Nodes (0): 

### Community 120 - "Community 120"
Cohesion: 1.0
Nodes (0): 

### Community 121 - "Community 121"
Cohesion: 1.0
Nodes (0): 

### Community 122 - "Community 122"
Cohesion: 1.0
Nodes (0): 

### Community 123 - "Community 123"
Cohesion: 1.0
Nodes (0): 

### Community 124 - "Community 124"
Cohesion: 1.0
Nodes (0): 

### Community 125 - "Community 125"
Cohesion: 1.0
Nodes (0): 

### Community 126 - "Community 126"
Cohesion: 1.0
Nodes (0): 

### Community 127 - "Community 127"
Cohesion: 1.0
Nodes (0): 

### Community 128 - "Community 128"
Cohesion: 1.0
Nodes (0): 

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (0): 

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (0): 

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (0): 

### Community 132 - "Community 132"
Cohesion: 1.0
Nodes (0): 

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (0): 

### Community 134 - "Community 134"
Cohesion: 1.0
Nodes (0): 

### Community 135 - "Community 135"
Cohesion: 1.0
Nodes (0): 

### Community 136 - "Community 136"
Cohesion: 1.0
Nodes (0): 

### Community 137 - "Community 137"
Cohesion: 1.0
Nodes (0): 

### Community 138 - "Community 138"
Cohesion: 1.0
Nodes (0): 

### Community 139 - "Community 139"
Cohesion: 1.0
Nodes (0): 

### Community 140 - "Community 140"
Cohesion: 1.0
Nodes (0): 

### Community 141 - "Community 141"
Cohesion: 1.0
Nodes (0): 

### Community 142 - "Community 142"
Cohesion: 1.0
Nodes (0): 

### Community 143 - "Community 143"
Cohesion: 1.0
Nodes (0): 

### Community 144 - "Community 144"
Cohesion: 1.0
Nodes (0): 

### Community 145 - "Community 145"
Cohesion: 1.0
Nodes (0): 

### Community 146 - "Community 146"
Cohesion: 1.0
Nodes (0): 

### Community 147 - "Community 147"
Cohesion: 1.0
Nodes (0): 

### Community 148 - "Community 148"
Cohesion: 1.0
Nodes (0): 

### Community 149 - "Community 149"
Cohesion: 1.0
Nodes (0): 

### Community 150 - "Community 150"
Cohesion: 1.0
Nodes (0): 

### Community 151 - "Community 151"
Cohesion: 1.0
Nodes (0): 

### Community 152 - "Community 152"
Cohesion: 1.0
Nodes (0): 

### Community 153 - "Community 153"
Cohesion: 1.0
Nodes (0): 

### Community 154 - "Community 154"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 67`** (2 nodes): `tuleapReconcileDeletes.test.js`, `makePool()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (2 nodes): `requireStatus.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (2 nodes): `teamAccess.test.js`, `makeRes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (2 nodes): `testApp.js`, `createTestApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (2 nodes): `tuleapSmokeTest.js`, `smoke()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (2 nodes): `init_phase3.js`, `initPhase3()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (2 nodes): `no-bare-projectId.js`, `create()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (2 nodes): `error.js`, `errorHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (2 nodes): `n8n.js`, `triggerWorkflow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (2 nodes): `me.routes.js`, `dashboardHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (2 nodes): `userStories.routes.js`, `parseCsvParam()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (2 nodes): `links.routes.js`, `makeLinkRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (2 nodes): `projects.routes.js`, `buildTeamFilter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (2 nodes): `tuleapReconcileDeletes.js`, `reconcileDeletes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (2 nodes): `developmentPlans_editing.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (2 nodes): `developmentPlans_history.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (2 nodes): `developmentPlans_onHold.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (2 nodes): `db.js`, `runMigrations()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (2 nodes): `middleware.ts`, `middleware()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (2 nodes): `TaskModal.js`, `TaskModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (2 nodes): `Navbar.js`, `Navbar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (2 nodes): `PassRateTrendChart.tsx`, `toLocaleDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (2 nodes): `KeyboardShortcuts.tsx`, `KeyboardShortcuts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `api.fixture.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `auth-login.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `crud-tasks.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `crud-projects.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `jest.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (1 nodes): `taskEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (1 nodes): `taskTestCaseLinks.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (1 nodes): `tuleapUnifiedPatchSchema.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `userLifecycle.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (1 nodes): `testCaseEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `testExecutions.upload.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `bugLinking.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `suiteRuns.workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `tuleapAttachment.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `taskPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (1 nodes): `userStoryEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (1 nodes): `rbacCatalog.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `bugs.summary.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `bugPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (1 nodes): `tuleapValueNormalizer.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (1 nodes): `search.routes.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (1 nodes): `tuleapLinkResolver.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (1 nodes): `tuleapUnifiedWebhook.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `testExecutions.delete.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (1 nodes): `tuleapFieldRegistry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (1 nodes): `bugEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (1 nodes): `tuleapTransformEngine.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (1 nodes): `governance.qualityMetrics.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (1 nodes): `tuleapArtifacts.routes.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (1 nodes): `userStoryPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (1 nodes): `tuleapUnified.integration.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (1 nodes): `tuleapClient.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 123`** (1 nodes): `tuleapWebhook.config.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 124`** (1 nodes): `avatar.upload.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 125`** (1 nodes): `testCasePersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 126`** (1 nodes): `mockPool.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (1 nodes): `tuleapPayloads.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (1 nodes): `reports.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (1 nodes): `governance.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (1 nodes): `users.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (1 nodes): `teams.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (1 nodes): `roles.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (1 nodes): `resources.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (1 nodes): `db-connection.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (1 nodes): `journeys.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (1 nodes): `personalTasks.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (1 nodes): `testspriteWebhook.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (1 nodes): `project.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 139`** (1 nodes): `tuleapConfig.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (1 nodes): `resource.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (1 nodes): `tuleapUnified.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (1 nodes): `journey.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (1 nodes): `auth.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (1 nodes): `BugsBySourceChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (1 nodes): `integration.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (1 nodes): `work.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (1 nodes): `testing.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (1 nodes): `identity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 153`** (1 nodes): `quality.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 154`** (1 nodes): `lifecycle.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._