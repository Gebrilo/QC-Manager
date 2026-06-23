# Graph Report - .  (2026-06-23)

## Corpus Check
- 520 files · ~721,156 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1693 nodes · 2007 edges · 256 communities detected
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
Nodes (55): blobToBase64(), closeModal(), confirmDelete(), confirmDeleteProject(), errorLabels(), fetchPermissions(), getAuthHeaders(), handleAddMember() (+47 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (15): artifactPath(), artifactPublicId(), handleSave(), loadGates(), handleSubmit(), loadData(), handleGenerate(), pollJobStatus() (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (4): hashStr(), toneFor(), relativeTime(), SyncBadge()

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (24): ErrorBoundary, addFilter(), applyView(), dispatchFilterUpdate(), handleSearchChange(), removeFilter(), markAsRead(), openNotification() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (2): fetchTestExecution(), p()

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (14): makeBug(), mockBugApis(), mockAuthenticatedSession(), seedAuth(), makeStory(), mockStoryApis(), makeTask(), mockTaskApis() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (9): handleDownload(), saveBlobToDevice(), Gauge(), gaugeColor(), add(), send(), createReportPdfBlob(), downloadReportAsPdf() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (19): applyTuleapPrimary(), AssignmentValidationError, buildTaskAssignmentsPayload(), daysToHours(), getTaskAssignmentDefaults(), getTaskAssignments(), getTaskAssignmentSummary(), hoursToDays() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (5): handleDiscover(), saveFields(), saveStatus(), saveValues(), showToast()

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (15): assignmentBreakdown(), byStatus(), canEditTask(), canTakeOverTask(), getMemberDashboard(), getRelatedUserStories(), getSharedWithMe(), getTaskRows() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (4): flushParagraph(), parseMarkdown(), formatDate(), roadmapDateLabel()

### Community 13 - "Community 13"
Cohesion: 0.26
Nodes (12): aliasesForCanonical(), customRoleExists(), defaultsForRole(), getRolePermissionSet(), isBuiltInRole(), listRoles(), normalizeRoleName(), roleExists() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (12): applyValueMap(), buildTuleapValues(), demoteOnReassign(), dispatchAction(), emitToTuleap(), generateTaskId(), handleArchive(), handleDelete() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.27
Nodes (9): canonicalRole(), canUserPerform(), canUserUseScope(), collectRolePermissions(), collectRoleScopes(), isKnownPermissionKey(), isTeamManagerRole(), normalizeOverrideMap() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.26
Nodes (9): getBugsBySeverity(), getBugsByStatus(), getOverdueCount(), getResourceUtilization(), getTasksByStatus(), getTasksByTeam(), getUserStoryProgress(), getWorkloadCounts() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.26
Nodes (9): attachTeamScope(), canAccessProject(), canAccessTask(), canAccessTeamMember(), canAccessUser(), getManagerTeam(), getManagerTeamId(), getTeamScopeFilter() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.31
Nodes (12): createArtifactSignedUrl(), createSignedUrl(), deleteArtifactFile(), deleteFile(), downloadArtifactFile(), downloadFile(), ensureArtifactBucketExists(), ensureBucketExists() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (9): applyValueMap(), buildTuleapValues(), createBug(), dispatchAction(), emitToTuleap(), handleDelete(), handleSync(), resolveLinkedIds() (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.24
Nodes (7): addRoutes(), artifactIdentity(), auditLinkForArtifacts(), displayExpr(), fields(), linkAuditPayload(), pluralPath()

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (4): buildAutoDetailFields(), formatFieldValue(), humanizeLabel(), isUuid()

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.45
Nodes (10): activeUserPredicate(), assertNotLastHolder(), countActiveHoldersExcludingRole(), countActiveHoldersExcludingUser(), countActiveHoldersOfKey(), countActiveHoldersOfKeyForRole(), countActiveHoldersOfKeyForUser(), roleStorageCaseSql() (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (4): buildPlanDetail(), buildProgress(), getPlanForUser(), getPlanForUserOrId()

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (7): capitalCase(), generateApiFixture(), generateAuthTest(), generateCrudTest(), generatePageModel(), main(), parseArgs()

### Community 28 - "Community 28"
Cohesion: 0.4
Nodes (8): appendListFilter(), canEvaluateAccessEngine(), decorateRows(), enforceArtifact(), hasAccessActor(), logAuditEvent(), logDenial(), normalizeArtifact()

### Community 29 - "Community 29"
Cohesion: 0.36
Nodes (8): buildListFilter(), canPerform(), hasAclGrant(), hasAny(), isAssignee(), isProjectTeamMember(), isTeammateOfAssignee(), permKey()

### Community 30 - "Community 30"
Cohesion: 0.24
Nodes (3): insertRow(), updateRow(), writableEntries()

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (2): getUserStoryDisplayId(), userStoryMatchesQuery()

### Community 32 - "Community 32"
Cohesion: 0.39
Nodes (8): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), generateTestCaseId(), handleDelete(), handleSync(), normalizeTestCaseStatus()

### Community 33 - "Community 33"
Cohesion: 0.47
Nodes (8): artifactLabel(), dispatchFromAudit(), dispatchLinkNotification(), dispatchTaskAssignment(), insertMany(), insertNotification(), resolveActorId(), resolveLinkEndpointRecipients()

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (2): buildReportPayload(), rowsToCsv()

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 0.36
Nodes (4): buildOperation(), operationId(), pathParameters(), toOpenApiPath()

### Community 39 - "Community 39"
Cohesion: 0.43
Nodes (7): applyValueMap(), buildTuleapValues(), dispatchAction(), emitToTuleap(), handleDelete(), handleSync(), updateUserStory()

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (2): makeRes(), runMiddleware()

### Community 42 - "Community 42"
Cohesion: 0.29
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (2): mockResolverForRole(), newEffectiveSet()

### Community 45 - "Community 45"
Cohesion: 0.52
Nodes (6): buildBugPayload(), buildTaskPayload(), buildTestCasePayload(), buildUserStoryPayload(), required(), toTuleapSeverity()

### Community 46 - "Community 46"
Cohesion: 0.43
Nodes (1): FieldRegistry

### Community 47 - "Community 47"
Cohesion: 0.52
Nodes (6): applyFieldMappings(), applyStatusMap(), fromTuleap(), getEffectiveMapping(), reverseStatusMap(), toTuleap()

### Community 48 - "Community 48"
Cohesion: 0.52
Nodes (6): activateUser(), archiveUser(), lifecycleError(), markReadyForActivation(), rollbackUser(), suspendUser()

### Community 49 - "Community 49"
Cohesion: 0.62
Nodes (6): addWorkingDays(), computeTaskTimeline(), countWorkingDays(), getTaskHealth(), isWorkingDay(), normalizeDate()

### Community 50 - "Community 50"
Cohesion: 0.52
Nodes (6): loadRolePermissions(), loadRoleScopes(), loadScope(), loadUserPermissions(), loadUserScopes(), resolve()

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (2): resolveConfig(), resolveTrackerId()

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (2): logAiContentRequest(), safeJson()

### Community 53 - "Community 53"
Cohesion: 0.43
Nodes (5): getAllowedRelationshipTypes(), getDefaultRelationshipType(), getDirectionalRelationshipLabel(), getInverseRelationshipLabel(), isAllowedRelationshipType()

### Community 54 - "Community 54"
Cohesion: 0.48
Nodes (5): clampPercentage(), getTaskTimeRemainingState(), getToneForRemaining(), parseCalendarDay(), state()

### Community 55 - "Community 55"
Cohesion: 0.43
Nodes (4): emitApiError(), fetchApi(), fetchApiBlob(), parseContentDispositionFileName()

### Community 56 - "Community 56"
Cohesion: 0.6
Nodes (5): checkDependency(), checkDevServer(), checkDirectory(), checkFile(), main()

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 0.47
Nodes (3): handleTestSpriteWebhook(), parseTestSpriteResults(), uploadTestSpriteResults()

### Community 59 - "Community 59"
Cohesion: 0.73
Nodes (5): defaultsFor(), loadDefaultRow(), lookupHumanCreatorTeam(), lookupTuleapCreatorTeam(), resolveQuery()

### Community 60 - "Community 60"
Cohesion: 0.4
Nodes (2): dispatchWithSyncNotification(), emitTuleapSyncNotification()

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 0.4
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 0.4
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 0.4
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 0.4
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 0.4
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 0.6
Nodes (4): makeRes(), mockResolveSequence(), rows(), runMiddleware()

### Community 68 - "Community 68"
Cohesion: 0.4
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 0.4
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 0.7
Nodes (4): getKey(), normalize(), valueFromBindIds(), valueFromInlineValues()

### Community 71 - "Community 71"
Cohesion: 0.5
Nodes (2): buildSearchQuery(), buildTypeFragment()

### Community 72 - "Community 72"
Cohesion: 0.5
Nodes (2): formatPermissionLabel(), permissionAction()

### Community 73 - "Community 73"
Cohesion: 0.5
Nodes (2): httpError(), resolveArtifactId()

### Community 74 - "Community 74"
Cohesion: 0.4
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 0.4
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 0.4
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 0.5
Nodes (2): downloadCSV(), triggerBlobDownload()

### Community 78 - "Community 78"
Cohesion: 0.5
Nodes (1): ProjectPage

### Community 79 - "Community 79"
Cohesion: 0.5
Nodes (1): LoginPage

### Community 80 - "Community 80"
Cohesion: 0.5
Nodes (1): TaskBoard

### Community 81 - "Community 81"
Cohesion: 0.83
Nodes (3): buildCommand(), main(), parseArgs()

### Community 82 - "Community 82"
Cohesion: 0.83
Nodes (3): createDirectory(), createFile(), main()

### Community 83 - "Community 83"
Cohesion: 0.5
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 0.5
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 0.5
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 0.5
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 0.67
Nodes (2): breakGlassClient(), makeClient()

### Community 88 - "Community 88"
Cohesion: 0.5
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 0.5
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 0.67
Nodes (2): permissions(), roleFixture()

### Community 91 - "Community 91"
Cohesion: 0.83
Nodes (3): createMockAuditLog(), createMockPool(), setupTestApp()

### Community 92 - "Community 92"
Cohesion: 0.67
Nodes (2): createTuleapClient(), get()

### Community 93 - "Community 93"
Cohesion: 0.67
Nodes (2): estimateAccuracy(), finiteNumber()

### Community 94 - "Community 94"
Cohesion: 0.83
Nodes (3): extractPermissionReferences(), validatePermissionCatalog(), walkJavaScriptFiles()

### Community 95 - "Community 95"
Cohesion: 0.67
Nodes (2): isRoleSeeded(), seedRolePermissions()

### Community 96 - "Community 96"
Cohesion: 0.83
Nodes (3): defaultScopesForRole(), isRoleScopeSeeded(), seedRoleScopes()

### Community 97 - "Community 97"
Cohesion: 0.5
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 0.5
Nodes (0): 

### Community 99 - "Community 99"
Cohesion: 0.5
Nodes (0): 

### Community 100 - "Community 100"
Cohesion: 1.0
Nodes (2): escapeHtml(), generateProjectSummaryHTML()

### Community 101 - "Community 101"
Cohesion: 1.0
Nodes (2): log(), validateWorkflow()

### Community 102 - "Community 102"
Cohesion: 0.67
Nodes (0): 

### Community 103 - "Community 103"
Cohesion: 0.67
Nodes (0): 

### Community 104 - "Community 104"
Cohesion: 0.67
Nodes (0): 

### Community 105 - "Community 105"
Cohesion: 0.67
Nodes (0): 

### Community 106 - "Community 106"
Cohesion: 0.67
Nodes (0): 

### Community 107 - "Community 107"
Cohesion: 1.0
Nodes (2): makeRes(), runMiddleware()

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (0): 

### Community 109 - "Community 109"
Cohesion: 0.67
Nodes (0): 

### Community 110 - "Community 110"
Cohesion: 0.67
Nodes (0): 

### Community 111 - "Community 111"
Cohesion: 1.0
Nodes (2): gateDecision(), makeRes()

### Community 112 - "Community 112"
Cohesion: 1.0
Nodes (2): gateDecision(), makeRes()

### Community 113 - "Community 113"
Cohesion: 0.67
Nodes (0): 

### Community 114 - "Community 114"
Cohesion: 0.67
Nodes (0): 

### Community 115 - "Community 115"
Cohesion: 0.67
Nodes (0): 

### Community 116 - "Community 116"
Cohesion: 1.0
Nodes (2): httpError(), resolveArtifactUuid()

### Community 117 - "Community 117"
Cohesion: 0.67
Nodes (0): 

### Community 118 - "Community 118"
Cohesion: 1.0
Nodes (2): classifyWorkloadBalance(), toCount()

### Community 119 - "Community 119"
Cohesion: 1.0
Nodes (2): buildLink(), buildTestRunLinkForExecution()

### Community 120 - "Community 120"
Cohesion: 0.67
Nodes (0): 

### Community 121 - "Community 121"
Cohesion: 0.67
Nodes (0): 

### Community 122 - "Community 122"
Cohesion: 0.67
Nodes (0): 

### Community 123 - "Community 123"
Cohesion: 0.67
Nodes (0): 

### Community 124 - "Community 124"
Cohesion: 0.67
Nodes (0): 

### Community 125 - "Community 125"
Cohesion: 1.0
Nodes (2): createNotification(), notifyAdmins()

### Community 126 - "Community 126"
Cohesion: 0.67
Nodes (0): 

### Community 127 - "Community 127"
Cohesion: 0.67
Nodes (0): 

### Community 128 - "Community 128"
Cohesion: 0.67
Nodes (0): 

### Community 129 - "Community 129"
Cohesion: 0.67
Nodes (0): 

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (2): GET(), getOrigin()

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

### Community 212 - "Community 212"
Cohesion: 1.0
Nodes (0): 

### Community 213 - "Community 213"
Cohesion: 1.0
Nodes (0): 

### Community 214 - "Community 214"
Cohesion: 1.0
Nodes (0): 

### Community 215 - "Community 215"
Cohesion: 1.0
Nodes (0): 

### Community 216 - "Community 216"
Cohesion: 1.0
Nodes (0): 

### Community 217 - "Community 217"
Cohesion: 1.0
Nodes (0): 

### Community 218 - "Community 218"
Cohesion: 1.0
Nodes (0): 

### Community 219 - "Community 219"
Cohesion: 1.0
Nodes (0): 

### Community 220 - "Community 220"
Cohesion: 1.0
Nodes (0): 

### Community 221 - "Community 221"
Cohesion: 1.0
Nodes (0): 

### Community 222 - "Community 222"
Cohesion: 1.0
Nodes (0): 

### Community 223 - "Community 223"
Cohesion: 1.0
Nodes (0): 

### Community 224 - "Community 224"
Cohesion: 1.0
Nodes (0): 

### Community 225 - "Community 225"
Cohesion: 1.0
Nodes (0): 

### Community 226 - "Community 226"
Cohesion: 1.0
Nodes (0): 

### Community 227 - "Community 227"
Cohesion: 1.0
Nodes (0): 

### Community 228 - "Community 228"
Cohesion: 1.0
Nodes (0): 

### Community 229 - "Community 229"
Cohesion: 1.0
Nodes (0): 

### Community 230 - "Community 230"
Cohesion: 1.0
Nodes (0): 

### Community 231 - "Community 231"
Cohesion: 1.0
Nodes (0): 

### Community 232 - "Community 232"
Cohesion: 1.0
Nodes (0): 

### Community 233 - "Community 233"
Cohesion: 1.0
Nodes (0): 

### Community 234 - "Community 234"
Cohesion: 1.0
Nodes (0): 

### Community 235 - "Community 235"
Cohesion: 1.0
Nodes (0): 

### Community 236 - "Community 236"
Cohesion: 1.0
Nodes (0): 

### Community 237 - "Community 237"
Cohesion: 1.0
Nodes (0): 

### Community 238 - "Community 238"
Cohesion: 1.0
Nodes (0): 

### Community 239 - "Community 239"
Cohesion: 1.0
Nodes (0): 

### Community 240 - "Community 240"
Cohesion: 1.0
Nodes (0): 

### Community 241 - "Community 241"
Cohesion: 1.0
Nodes (0): 

### Community 242 - "Community 242"
Cohesion: 1.0
Nodes (0): 

### Community 243 - "Community 243"
Cohesion: 1.0
Nodes (0): 

### Community 244 - "Community 244"
Cohesion: 1.0
Nodes (0): 

### Community 245 - "Community 245"
Cohesion: 1.0
Nodes (0): 

### Community 246 - "Community 246"
Cohesion: 1.0
Nodes (0): 

### Community 247 - "Community 247"
Cohesion: 1.0
Nodes (0): 

### Community 248 - "Community 248"
Cohesion: 1.0
Nodes (0): 

### Community 249 - "Community 249"
Cohesion: 1.0
Nodes (0): 

### Community 250 - "Community 250"
Cohesion: 1.0
Nodes (0): 

### Community 251 - "Community 251"
Cohesion: 1.0
Nodes (0): 

### Community 252 - "Community 252"
Cohesion: 1.0
Nodes (0): 

### Community 253 - "Community 253"
Cohesion: 1.0
Nodes (0): 

### Community 254 - "Community 254"
Cohesion: 1.0
Nodes (0): 

### Community 255 - "Community 255"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 131`** (2 nodes): `tuleapReconcileDeletes.test.js`, `makePool()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (2 nodes): `roleResolver.test.js`, `rows()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (2 nodes): `requireStatus.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (2 nodes): `userStories.delete.test.js`, `buildApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (2 nodes): `landingPage.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (2 nodes): `list-endpoints.smoke.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (2 nodes): `accessEngineTypeCasts.test.js`, `resolveWith()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (2 nodes): `testExecutionsBulkUpdate.postgres.test.js`, `poolConfig()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 139`** (2 nodes): `developmentPlans.onHold.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (2 nodes): `coverageLinks.test.js`, `artifactById()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (2 nodes): `artifactResolver.test.js`, `fakeQuery()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (2 nodes): `testApp.js`, `createTestApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (2 nodes): `governance.workloadBalance.test.js`, `rowsFixture()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (2 nodes): `reports.download.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (2 nodes): `developmentPlans.editing.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (2 nodes): `taskAssignmentReportingViews.test.js`, `sourceAfter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (2 nodes): `rbacSeed.test.js`, `makeClient()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (2 nodes): `teamAccess.test.js`, `makeRes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (2 nodes): `resolveArtifactParam.test.js`, `mockRes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (2 nodes): `developmentPlans.history.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (2 nodes): `testCaseMigrationOrder.test.js`, `indexOfOrThrow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (2 nodes): `accessEngineSliceTwo.test.js`, `makeQueryStub()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 153`** (2 nodes): `byIdHumanResolve.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 154`** (2 nodes): `resources.analyticsGate.test.js`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 155`** (2 nodes): `notifications.dispatcher.test.js`, `notifiedUserIds()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 156`** (2 nodes): `access.test.js`, `rows()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 157`** (2 nodes): `adminAccess.test.js`, `makeApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 158`** (2 nodes): `tuleapSmokeTest.js`, `smoke()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 159`** (2 nodes): `init_phase3.js`, `initPhase3()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (2 nodes): `tuleapReconcileDeletes.js`, `reconcileDeletes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (2 nodes): `localEditGuard.js`, `hasUnsyncedLocalEdit()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (2 nodes): `open.js`, `resolveNotificationTarget()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 163`** (2 nodes): `error.js`, `errorHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 164`** (2 nodes): `n8n.js`, `triggerWorkflow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (2 nodes): `db.js`, `runMigrations()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 166`** (2 nodes): `projects.js`, `buildTeamFilter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 167`** (2 nodes): `dashboard.js`, `getTeamMetrics()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 168`** (2 nodes): `me.js`, `dashboardHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 169`** (2 nodes): `testSuites.js`, `validateSuiteTestCases()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (2 nodes): `TaskModal.js`, `TaskModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 171`** (2 nodes): `Navbar.js`, `Navbar()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (2 nodes): `PassRateTrendChart.tsx`, `toLocaleDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (2 nodes): `KeyboardShortcuts.tsx`, `KeyboardShortcuts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (1 nodes): `api.fixture.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (1 nodes): `auth-login.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (1 nodes): `crud-tasks.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (1 nodes): `crud-projects.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (1 nodes): `jest.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (1 nodes): `taskEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 181`** (1 nodes): `artifactUpdateSchemas.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 182`** (1 nodes): `taskTestCaseLinks.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (1 nodes): `localEditGuard.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (1 nodes): `tuleapUnifiedPatchSchema.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 185`** (1 nodes): `userLifecycle.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (1 nodes): `testCaseEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (1 nodes): `taskSyncRetry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (1 nodes): `estimateAccuracy.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (1 nodes): `testExecutions.upload.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (1 nodes): `bugLinking.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (1 nodes): `artifactVisibilityDefaulter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (1 nodes): `suiteRuns.workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `tuleapAttachment.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `taskPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `userStoryEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `rbacCatalog.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `bugs.summary.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (1 nodes): `testCaseSyncRetry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (1 nodes): `bugNormalizer.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (1 nodes): `auditLog.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (1 nodes): `bugPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (1 nodes): `workloadBalance.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (1 nodes): `tuleapValueNormalizer.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (1 nodes): `search.routes.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `tuleapLinkResolver.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (1 nodes): `tuleapUnifiedWebhook.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 207`** (1 nodes): `testExecutions.delete.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 208`** (1 nodes): `tuleapFieldRegistry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 209`** (1 nodes): `bugEmitter.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 210`** (1 nodes): `tuleapTransformEngine.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 211`** (1 nodes): `governance.qualityMetrics.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 212`** (1 nodes): `tuleapArtifacts.routes.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 213`** (1 nodes): `userStoryPersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 214`** (1 nodes): `tuleapUnified.integration.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (1 nodes): `authMe.accessShape.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (1 nodes): `tuleapClient.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (1 nodes): `tuleapWebhook.config.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (1 nodes): `db-connection.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (1 nodes): `avatar.upload.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 220`** (1 nodes): `testCasePersister.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (1 nodes): `mockPool.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 222`** (1 nodes): `tuleapPayloads.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 223`** (1 nodes): `rbacIntendedChanges.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 224`** (1 nodes): `project.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 225`** (1 nodes): `tuleapConfig.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 226`** (1 nodes): `resource.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 227`** (1 nodes): `userStory.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 228`** (1 nodes): `tuleapUnified.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 229`** (1 nodes): `journey.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 230`** (1 nodes): `managerView.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 231`** (1 nodes): `personalTasks.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 232`** (1 nodes): `testCaseTasks.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 233`** (1 nodes): `testResults.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 234`** (1 nodes): `testspriteWebhook.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 235`** (1 nodes): `resources.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 236`** (1 nodes): `teams.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 237`** (1 nodes): `journeys.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 238`** (1 nodes): `taskTestCases.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 239`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 240`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 241`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 242`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 243`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 244`** (1 nodes): `landing-cta.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 245`** (1 nodes): `auth.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 246`** (1 nodes): `redirects.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 247`** (1 nodes): `landing-theme.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 248`** (1 nodes): `BugsBySourceChart.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 249`** (1 nodes): `artifactPath.guard.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 250`** (1 nodes): `integration.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 251`** (1 nodes): `work.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 252`** (1 nodes): `testing.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 253`** (1 nodes): `identity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 254`** (1 nodes): `quality.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 255`** (1 nodes): `lifecycle.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._