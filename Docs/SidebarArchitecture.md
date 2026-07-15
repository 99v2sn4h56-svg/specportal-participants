# Sidebar Architecture

## Purpose

The Google Sheets sidebar is a compact participant-search tool for the Participants workbook. It is not the full Spec Central platform shell.

## Entry Point

`openSpecPortalHome()` renders `Portal.html` through `HtmlService` and opens it as a Google Sheets sidebar.

## Shell

The sidebar uses:

- `Portal.html`
- `Portal/Components/SidebarHeader.html`
- `Portal/Styles/Portal.html`
- `Portal/Pages/Dashboard.html`
- `Portal/Pages/Search.html`
- `Portal/Pages/Profile.html`

It must not include:

- `Portal/Components/FullPageHeader.html`
- `Portal/Components/Sidebar.html`
- `Portal/Components/TopBar.html`
- `Portal/Components/StatusRibbon.html`
- full-page navigation
- Calendar shell
- Operations shell
- Media Timeline shell

## Width Target

The sidebar should remain usable at approximately 300-400px wide.

## Shared Contracts

The sidebar may share:

- Apps Script gateway functions
- participant data shape
- group count semantics
- photo key and URL semantics
- field mapping rules

It should not share the full-page App bootstrap sequence.

## Current Risks

- Generic CSS names such as `.panel`, `.status`, `.avatar`, `.result` can collide if files are cross-included.
- Search/profile helpers are duplicated with the full-page app.
- Future shared logic should be moved into explicit, small utilities rather than sharing presentation shells.
