# Manager Legacy Alias UI Scenarios

## Intent

Validate that legacy `manager` users still behave like team managers. This role exists as an alias for `team_manager`, but some routes still use exact role checks for `manager`.

## Expected Navigation

Same as `team_manager`:

- My Work, Quality, and Manage are visible.
- Admin is hidden.
- Team dashboard, resources, team journeys, team IDP, and task history are accessible.

## Scenarios

### MGR-01: Alias navigation parity

1. Log in as `MANAGER_ALIAS_USER`.
2. Confirm My Work, Quality, and Manage sections are visible.
3. Confirm Admin section is hidden.
4. Open `/dashboards/team-manager`.

Expected: navigation matches `team_manager`.

### MGR-02: Legacy team API compatibility

1. Open `/team/resources`.
2. Open `/team/journeys`.
3. Open `/team/idp`.
4. Open a Team A member profile or plan.

Expected: legacy manager can access team-scoped routes without 403 responses.

### MGR-03: Team scope boundary

1. Confirm Team A members and artifacts are visible.
2. Try direct URLs for Team B member journey, IDP, resource, task, and bug records.

Expected: Team B records are denied, hidden, or not found.

### MGR-04: Compare with team_manager

1. Run TM-02 through TM-05 from `team-manager.md` with `MANAGER_ALIAS_USER`.
2. Compare results to `TEAM_MANAGER_USER`.

Expected: both roles behave the same from the user's perspective. Any difference is a compatibility bug unless deliberately configured through custom role permissions.

