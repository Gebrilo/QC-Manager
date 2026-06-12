# Graph Report - .  (2026-06-12)

## Corpus Check
- 435 files · ~614,029 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1359 nodes · 1607 edges · 212 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `getStorageClient()` - 12 edges
2. `withAccess()` - 9 edges
3. `getManagerTeamId()` - 9 edges
4. `showError()` - 9 edges
5. `showSuccess()` - 8 edges
6. `canPerform()` - 7 edges
7. `loadTeamDetails()` - 7 edges
8. `capitalCase()` - 6 edges
9. `FieldRegistry` - 6 edges
10. `lifecycleError()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `confirmDelete()` --calls--> `loadResources()`  [EXTRACTED]
  apps/web/app/work/stories/page.tsx → apps/web/app/team/resources/page.tsx
- `confirmDelete()` --calls--> `loadJourneys()`  [EXTRACTED]
  apps/web/app/work/stories/page.tsx → apps/web/app/admin/journeys/page.tsx
- `confirmDelete()` --calls--> `showSuccess()`  [EXTRACTED]
  apps/web/app/work/stories/page.tsx → apps/web/app/admin/teams/page.tsx
- `confirmDelete()` --calls--> `showError()`  [EXTRACTED]
  apps/web/app/work/stories/page.tsx → apps/web/app/admin/teams/page.tsx
- `handleUpload()` --calls--> `parseCSV()`  [EXTRACTED]
  apps/web/app/test/runs/page.tsx → apps/web/app/test/results/upload/page.tsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (45): blobToBase64(), closeModal(), confirmDelete(), confirmDeleteProject(), errorLabels(), fetchPermissions(), getAuthHeaders(), handleAddMember() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (24): ErrorBoundary, addFilter(), applyView(), dispatchFilterUpdate(), handleSearchChange(), removeFilter(), markAsRead(), openNotification() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (7): handleSubmit(), loadData(), handleDelete(), handleSubmit(), loadComments(), applyStatus(), toggleDone()

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (4): handleGenerate(), pollJobStatus(), errorLabels(), onInvalid()

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (0): 

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (11): handleDownload(), saveBlobToDevice(), Gauge(), gaugeColor(), add(), send(), createReportPdfBlob(), downloadReportAsPdf() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (2): relativeTime(), SyncBadge()

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (19): applyTuleapPrimary(), AssignmentValidationError, buildTaskAssignmentsPayload(), daysToHours(), getTaskAssignmentDefaults(), getTaskAssignments(), getTaskAssignmentSummary(), hoursToDays() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (2): mockAuthenticatedSession(), seedAuth()

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (0): 

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (5): handleDiscover(), saveFields(), saveStatus(), saveValues(), showToast()

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (15): assignmentBreakdown(), byStatus(), canEditTask(), canTakeOverTask(), getMemberDashboard(), getRelatedUserStories(), getSharedWithMe(), getTaskRows() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (12): aliasesForCanonical(), customRoleExists(), defaultsForRole(), getRolePermissionSet(), isBuiltInRole(), listRoles(), normalizeRoleName(), roleExists() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (12): applyValueMap(), buildTuleapValues(), demoteOnReassign(), dispatchAction(), emitToTuleap(), generateTaskId(), handleArchive(), handleDelete() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.26
Nodes (9): getBugsBySeverity(), getBugsByStatus(), getOverdueCount(), getResourceUtilization(), getTasksByStatus(), getTasksByTeam(), getUserStoryProgress(), getWorkloadCounts() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.26
Nodes (9): attachTeamScope(), canAccessProject(), canAccessTask(), canAccessTeamMember(), canAccessUser(), getManagerTeam(), getManagerTeamId(), getTeamScopeFilter() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (12): createArtifactSignedUrl(), createSignedUrl(), deleteArtifactFile(), deleteFile(), downloadArtifactFile(), downloadFile(), ensureArtifactBucketExists(), ensureBucketExists() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.3
Nodes (9): canonicalRole(), canUserPerform(), canUserUseScope(), collectRolePermissions(), collectRoleScopes(), isKnownPermissionKey(), isTeamManagerRole(), normalizeOverrideMap() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (9): applyValueMap(), buildTuleapValues(), createBug(), dispatchAction(), emitToTuleap(), handleDelete(), handleSync(), resolveLinkedIds() (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (4): buildPlanDetail(), buildProgress(), getPlanForUser(), getPlanForUserOrId()

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (7): capitalCase(), generateApiFixture(), generateAuthTest(), generateCrudTest(), generatePageModel(), main(), parseArgs()

### Community 23 - "Community 23"
Cohesion: 0.2
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (8): appendListFilter(), canEvaluateAccessEngine(), decorateRows(), enforceArtifact(), hasAccessActor(), logAuditEvent(), logDenial(), normalizeArtifact()

### Community 25 - "Community 25"
Cohesion: 0.2
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (8): buildListFilter(), canPerform(), hasAclGrant(), hasAny(), isAssignee(), isProjectTeamMember(), isTeammateOfAssignee(), permKey()

### Community 27 - "Community 27"
Cohesion: 0.39
Nodes (8): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), generateTestCaseId(), handleDelete(), handleSync(), normalizeTestCaseStatus()

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (2): buildReportPayload(), rowsToCsv()

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 0.43
Nodes (7): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), handleDelete(), handleSync(), updateUserStory()

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 0.52
Nodes (6): buildBugPayload(), buildTaskPayload(), buildTestCasePayload(), buildUserStoryPayload(), required(), toTuleapSeverity()

### Community 33 - "Community 33"
Cohesion: 0.43
Nodes (1): FieldRegistry

### Community 34 - "Community 34"
Cohesion: 0.52
Nodes (6): applyFieldMappings(), applyStatusMap(), fromTuleap(), getEffectiveMapping(), reverseStatusMap(), toTuleap()

### Community 35 - "Community 35"
Cohesion: 0.52
Nodes (6): activateUser(), archiveUser(), lifecycleError(), markReadyForActivation(), rollbackUser(), suspendUser()

### Community 36 - "Community 36"
Cohesion: 0.62
Nodes (6): addWorkingDays(), computeTaskTimeline(), countWorkingDays(), getTaskHealth(), isWorkingDay(), normalizeDate()

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (2): resolveConfig(), resolveTrackerId()

### Community 38 - "Community 38"
Cohesion: 0.43
Nodes (4): emitApiError(), fetchApi(), fetchApiBlob(), parseContentDispositionFileName()

### Community 39 - "Community 39"
Cohesion: 0.6
Nodes (5): checkDependency(), checkDevServer(), checkDirectory(), checkFile(), main()

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 0.47
Nodes (3): handleTestSpriteWebhook(), parseTestSpriteResults(), uploadTestSpriteResults()

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (5): dispatchFromAudit(), dispatchTaskAssignment(), insertMany(), insertNotification(), resolveActorId()

### Community 43 - "Community 43"
Cohesion: 0.73
Nodes (5): defaultsFor(), loadDefaultRow(), lookupHumanCreatorTeam(), lookupTuleapCreatorTeam(), resolveQuery()

### Community 44 - "Community 44"
Cohesion: 0.4
Nodes (2): dispatchWithSyncNotification(), emitTuleapSyncNotification()

### Community 45 - "Community 45"
Cohesion: 0.53
Nodes (4): addRoutes(), displayExpr(), fields(), pluralPath()

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 0.4
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 0.4
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 0.4
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 0.4
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 0.4
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 0.4
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 0.7
Nodes (4): getKey(), normalize(), valueFromBindIds(), valueFromInlineValues()

### Community 55 - "Community 55"
Cohesion: 0.7
Nodes (4): loadRolePermissions(), loadScope(), loadUserPermissions(), resolve()

### Community 56 - "Community 56"
Cohesion: 0.5
Nodes (2): formatPermissionLabel(), permissionAction()

### Community 57 - "Community 57"
Cohesion: 0.4
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 0.4
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 0.4
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 0.5
Nodes (2): downloadCSV(), triggerBlobDownload()

### Community 61 - "Community 61"
Cohesion: 0.5
Nodes (1): ProjectPage

### Community 62 - "Community 62"
Cohesion: 0.5
Nodes (1): LoginPage

### Community 63 - "Community 63"
Cohesion: 0.5
Nodes (1): TaskBoard

### Community 64 - "Community 64"
Cohesion: 0.83
Nodes (3): buildCommand(), main(), parseArgs()

### Community 65 - "Community 65"
Cohesion: 0.83
Nodes (3): createDirectory(), createFile(), main()

### Community 66 - "Community 66"
Cohesion: 0.5
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 0.5
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 0.5
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 0.5
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 0.5
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (2): permissions(), roleFixture()

### Community 72 - "Community 72"
Cohesion: 0.83
Nodes (3): createMockAuditLog(), createMockPool(), setupTestApp()

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (2): createTuleapClient(), get()

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (2): estimateAccuracy(), finiteNumber()

### Community 75 - "Community 75"
Cohesion: 0.83
Nodes (3): extractPermissionReferences(), validatePermissionCatalog(), walkJavaScriptFiles()

### Community 76 - "Community 76"
Cohesion: 0.5
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 0.5
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 0.5
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 0.5
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (2): escapeHtml(), generateProjectSummaryHTML()

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (2): log(), validateWorkflow()

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 0.67
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (2): makeRes(), runMiddleware()

### Community 87 - "Community 87"
Cohesion: 0.67
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 0.67
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 0.67
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 0.67
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 0.67
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 0.67
Nodes (0): 

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (2): buildLink(), buildTestRunLinkForExecution()

### Community 94 - "Community 94"
Cohesion: 0.67
Nodes (0): 

### Community 95 - "Community 95"
Cohesion: 0.67
Nodes (0): 

### Community 96 - "Community 96"
Cohesion: 0.67
Nodes (0): 

### Community 97 - "Community 97"
Cohesion: 0.67
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 1.0
Nodes (2): createNotification(), notifyAdmins()

### Community 99 - "Community 99"
Cohesion: 0.67
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 0.67
Nodes (0): 

### Community 101 - "Community 101"
Cohesion: 0.67
Nodes (0): 

### Community 102 - "Community 102"
Cohesion: 0.67
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (2): GET(), getOrigin()

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

### Community 155 - "Community 155"
Cohesion: 1.0
Nodes (0): 

### Community 156 - "Community 156"
Cohesion: 1.0
Nodes (0): 

### Community 157 - "Community 157"
Cohesion: 1.0
Nodes (0): 

### Community 158 - "Community 158"
Cohesion: 1.0
Nodes (0): 

### Community 159 - "Community 159"
Cohesion: 1.0
Nodes (0): 

### Community 160 - "Community 160"
Cohesion: 1.0
Nodes (0): 

### Community 161 - "Community 161"
Cohesion: 1.0
Nodes (0): 

### Community 162 - "Community 162"
Cohesion: 1.0
Nodes (0): 

### Community 163 - "Community 163"
Cohesion: 1.0
Nodes (0): 

### Community 164 - "Community 164"
Cohesion: 1.0
Nodes (0): 

### Community 165 - "Community 165"
Cohesion: 1.0
Nodes (0): 

### Community 166 - "Community 166"
Cohesion: 1.0
Nodes (0): 

### Community 167 - "Community 167"
Cohesion: 1.0
Nodes (0): 

### Community 168 - "Community 168"
Cohesion: 1.0
Nodes (0): 

### Community 169 - "Community 169"
Cohesion: 1.0
Nodes (0): 

### Community 170 - "Community 170"
Cohesion: 1.0
Nodes (0): 

### Community 171 - "Community 171"
Cohesion: 1.0
Nodes (0): 

### Community 172 - "Community 172"
Cohesion: 1.0
Nodes (0): 

### Community 173 - "Community 173"
Cohesion: 1.0
Nodes (0): 

### Community 174 - "Community 174"
Cohesion: 1.0
Nodes (0): 

### Community 175 - "Community 175"
Cohesion: 1.0
Nodes (0): 

### Community 176 - "Community 176"
Cohesion: 1.0
Nodes (0): 

### Community 177 - "Community 177"
Cohesion: 1.0
Nodes (0): 

### Community 178 - "Community 178"
Cohesion: 1.0
Nodes (0): 

### Community 179 - "Community 179"
Cohesion: 1.0
Nodes (0): 

### Community 180 - "Community 180"
Cohesion: 1.0
Nodes (0): 

### Community 181 - "Community 181"
Cohesion: 1.0
Nodes (0): 

### Community 182 - "Community 182"
Cohesion: 1.0
Nodes (0): 

### Community 183 - "Community 183"
Cohesion: 1.0
Nodes (0): 

### Community 184 - "Community 184"
Cohesion: 1.0
Nodes (0): 

### Community 185 - "Community 185"
Cohesion: 1.0
Nodes (0): 

### Community 186 - "Community 186"
Cohesion: 1.0
Nodes (0): 

### Community 187 - "Community 187"
Cohesion: 1.0
Nodes (0): 

### Community 188 - "Community 188"
Cohesion: 1.0
Nodes (0): 

### Community 189 - "Community 189"
Cohesion: 1.0
Nodes (0): 

### Community 190 - "Community 190"
Cohesion: 1.0
Nodes (0): 

### Community 191 - "Community 191"
Cohesion: 1.0
Nodes (0): 

### Community 192 - "Community 192"
Cohesion: 1.0
Nodes (0): 

### Community 193 - "Community 193"
Cohesion: 1.0
Nodes (0): 

### Community 194 - "Community 194"
Cohesion: 1.0
Nodes (0): 

### Community 195 - "Community 195"
Cohesion: 1.0
Nodes (0): 

### Community 196 - "Community 196"
Cohesion: 1.0
Nodes (0): 

### Community 197 - "Community 197"
Cohesion: 1.0
Nodes (0): 

### Community 198 - "Community 198"
Cohesion: 1.0
Nodes (0): 

### Community 199 - "Community 199"
Cohesion: 1.0
Nodes (0): 

### Community 200 - "Community 200"
Cohesion: 1.0
Nodes (0): 

### Community 201 - "Community 201"
Cohesion: 1.0
Nodes (0): 

### Community 202 - "Community 202"
Cohesion: 1.0
Nodes (0): 

### Community 203 - "Community 203"
Cohesion: 1.0
Nodes (0): 

### Community 204 - "Community 204"
Cohesion: 1.0
Nodes (0): 

### Community 205 - "Community 205"
Cohesion: 1.0
Nodes (0): 

### Community 206 - "Community 206"
Cohesion: 1.0
Nodes (0): 

### Community 207 - "Community 207"
Cohesion: 1.0
Nodes (0): 

### Community 208 - "Community 208"
Cohesion: 1.0
Nodes (0): 

### Community 209 - "Community 209"
Cohesion: 1.0
Nodes (0): 

### Community 210 - "Community 210"
Cohesion: 1.0
Nodes (0): 

### Community 211 - "Community 211"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 104`** (2 nodes): `tuleapReconcileDeletes.test.js`, `makePool()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (2 nodes): `roleResolver.test.js`, `rows()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (2 nodes): `requireStatus.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (2 nodes): `userStories.delete.test.js`, `buildApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (2 nodes): `list-endpoints.smoke.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (2 nodes): `accessEngineTypeCasts.test.js`, `resolveWith()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (2 nodes): `developmentPlans.onHold.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (2 nodes): `reports.download.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (2 nodes): `developmentPlans.editing.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (2 nodes): `taskAssignmentReportingViews.test.js`, `sourceAfter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (2 nodes): `teamAccess.test.js`, `makeRes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (2 nodes): `developmentPlans.history.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (2 nodes): `accessEngineSliceTwo.test.js`, `makeQueryStub()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (2 nodes): `notifications.dispatcher.test.js`, `notifiedUserIds()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (2 nodes): `access.test.js`, `rows()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (2 nodes): `adminAccess.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (2 nodes): `testApp.js`, `createTestApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (2 nodes): `tuleapSmokeTest.js`, `smoke()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (2 nodes): `init_phase3.js`, `initPhase3()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 123`** (2 nodes): `tuleapReconcileDeletes.js`, `reconcileDeletes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 124`** (2 nodes): `open.js`, `resolveNotificationTarget()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 125`** (2 nodes): `error.js`, `errorHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 126`** (2 nodes): `n8n.js`, `triggerWorkflow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (2 nodes): `db.js`, `runMigrations()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (2 nodes): `projects.js`, `buildTeamFilter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (2 nodes): `dashboard.js`, `getTeamMetrics()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (2 nodes): `me.js`, `dashboardHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (2 nodes): `artifactAttachments.js`, `adoptStagedAttachments()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (2 nodes): `testSuites.js`, `validateSuiteTestCases()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (2 nodes): `TaskModal.js`, `TaskModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (2 nodes): `Navbar.js`, `Navbar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (2 nodes): `PassRateTrendChart.tsx`, `toLocaleDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (2 nodes): `KeyboardShortcuts.tsx`, `KeyboardShortcuts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (1 nodes): `api.fixture.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 139`** (1 nodes): `auth-login.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (1 nodes): `crud-tasks.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (1 nodes): `crud-projects.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (1 nodes): `jest.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (1 nodes): `taskEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (1 nodes): `artifactUpdateSchemas.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (1 nodes): `taskTestCaseLinks.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (1 nodes): `tuleapUnifiedPatchSchema.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (1 nodes): `userLifecycle.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (1 nodes): `testCaseEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (1 nodes): `taskSyncRetry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (1 nodes): `estimateAccuracy.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (1 nodes): `testExecutions.upload.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (1 nodes): `bugLinking.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 153`** (1 nodes): `coverageLinks.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 154`** (1 nodes): `artifactVisibilityDefaulter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 155`** (1 nodes): `suiteRuns.workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 156`** (1 nodes): `tuleapAttachment.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 157`** (1 nodes): `taskPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 158`** (1 nodes): `userStoryEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 159`** (1 nodes): `rbacCatalog.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (1 nodes): `bugs.summary.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (1 nodes): `testCaseSyncRetry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (1 nodes): `bugNormalizer.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 163`** (1 nodes): `bugPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 164`** (1 nodes): `tuleapValueNormalizer.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (1 nodes): `search.routes.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 166`** (1 nodes): `tuleapLinkResolver.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 167`** (1 nodes): `tuleapUnifiedWebhook.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 168`** (1 nodes): `testExecutions.delete.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 169`** (1 nodes): `tuleapFieldRegistry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (1 nodes): `bugEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 171`** (1 nodes): `tuleapTransformEngine.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (1 nodes): `governance.qualityMetrics.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (1 nodes): `tuleapArtifacts.routes.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (1 nodes): `userStoryPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (1 nodes): `tuleapUnified.integration.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (1 nodes): `authMe.accessShape.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (1 nodes): `tuleapClient.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (1 nodes): `tuleapWebhook.config.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (1 nodes): `db-connection.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (1 nodes): `avatar.upload.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 181`** (1 nodes): `testCasePersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 182`** (1 nodes): `mockPool.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (1 nodes): `tuleapPayloads.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (1 nodes): `project.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 185`** (1 nodes): `tuleapConfig.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (1 nodes): `resource.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (1 nodes): `userStory.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (1 nodes): `tuleapUnified.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (1 nodes): `journey.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (1 nodes): `managerView.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (1 nodes): `personalTasks.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (1 nodes): `testCaseTasks.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `testResults.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `testspriteWebhook.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `resources.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `teams.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `journeys.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (1 nodes): `taskTestCases.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (1 nodes): `auth.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (1 nodes): `redirects.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `BugsBySourceChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (1 nodes): `integration.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 207`** (1 nodes): `work.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 208`** (1 nodes): `testing.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 209`** (1 nodes): `identity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 210`** (1 nodes): `quality.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 211`** (1 nodes): `lifecycle.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._