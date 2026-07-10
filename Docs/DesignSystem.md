# Spec Central Design System

## Purpose
Spec Central uses a shared visual language across the full-page app, sidebar, Attendance direction, and future modules.

## Tokens
- Blue: `#2D67B2`
- Yellow: `#FBCC39`
- Red: `#EF4343`
- Purple: `#BB529E`
- Sky: `#44C2F0`
- Orange: `#F79420`
- Magenta: `#EF509C`
- Mint: `#9DD085`
- Navy: `#061D3D`

## Reusable Patterns
- Header: `Portal/Components/Header.html`
- Sidebar: `Portal/Components/Sidebar.html`
- Top bar: `Portal/Components/TopBar.html`
- Status ribbon: `Portal/Components/StatusRibbon.html`
- Cards: `.panel`, `.moduleCard`, `.resultCard`, `.profilePanel`
- Statistic tiles: `.heroMetric`, `.moduleCard`, `.schoolStat`
- Buttons: `.quickLink`, `.schoolActionButton`, `.miniActionButton`
- Status pills: `.pill`, `.statusPill`
- Search bars: `.globalSearch`, `.participantSearch`
- Profile heroes: `.profileHero--student`, `.profileHero--school`, `.profileHero--item`, `.profileHero--group`, `.profileHero--teacher`
- Empty/loading states: `.empty`

## Interaction
Active sidebar items use a stronger selected state with a yellow left indicator. Cards use subtle hover lift and border emphasis. Protected modules are hidden unless Staff permissions include the matching `.view` permission.

## Known Limitations
The full-page app still keeps most browser runtime code inside `SpecCentral.html`. Future work should extract client modules once an Apps Script-safe bundling/include strategy is chosen.
