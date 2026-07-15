# Spec Central User Experience

## Product Boundary

Spec Central is the general staff-facing portal. It should answer:

> What information or action is relevant to me?

Operations is the restricted management centre. It should answer:

> How do we configure, administer and run Schools Spectacular?

The Home page must remain personal, even for administrators. Administrators can see an Operations entry point, but organisation-wide management controls belong inside Operations.

## Staff-Facing Home

Home should show:

- greeting and current user
- role and department
- next allocated event where real allocation data exists
- today/upcoming rehearsals from Timeline
- attendance availability
- relevant announcements
- recent searches and recently viewed records
- quick links to common staff tasks

Home should not show:

- all participant totals
- all school totals
- all group totals
- global staff totals
- diagnostics
- integration configuration
- administrative import/reconciliation controls

## Participants Experience

Participants should work as a directory:

- search people, schools, groups, items and teachers
- show useful initial states such as recent searches/recently viewed
- keep cards compact and type-coloured
- show headshots where available and initials immediately
- keep profile preview visible on desktop
- collapse to a single-column experience on smaller screens

## Profile Workspaces

Profiles should move toward tabbed or segmented workspaces:

- Participant: Overview, Attendance, Rehearsals, Contacts, History, Documents
- School: Overview, Participants, Groups, Teachers, Rehearsals, Attendance
- Item: Overview, Participants, Schools, Groups, Rehearsals, Attendance
- Group: Overview, School, Teacher, Students, Rehearsals, Attendance
- Teacher: Overview, Schools, Groups, Rehearsals, Contact

Only show sections with real data or an explicit connected placeholder.

## Loading And Empty States

No module should stay on "Loading..." forever. Each module needs:

- loading state
- empty state
- error state
- retry action where useful

Optional services such as Attendance or Media Timeline must fail independently without blocking core navigation.
