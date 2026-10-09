# House functional checklist

House reuses the Original office furniture components and handlers. The layout includes the following **14 actionable furniture types**, excluding decorative meshes and repeated instances. Unit coverage verifies the inventory and dispatch source. This checklist describes manual validation; it does not claim every external integration was exercised in the independent PR checkout.

| Functional type | House placement | Expected interaction |
|---|---|---|
| `desk_cubicle` | Dev Studio | Desk Actions menu |
| `computer` | Dev Studio | Assigned agent session/terminal monitor |
| `server_rack` | Dev Studio | GitHub review station |
| `server_terminal` | Dev Studio | GitHub review station |
| `atm` | Lounge | Treasury PIN overlay |
| `sms_booth` | Lounge | Messaging overlay |
| `phone_booth` | Lounge | Calling/dialing overlay |
| `jukebox` | Lounge | Jukebox panel |
| `kanban_board` | Lounge | Hermes Task Board |
| `qa_terminal` | Lounge | Testing Console |
| `device_rack` | Lounge | Testing Console |
| `test_bench` | Lounge | Testing Console |
| `pingpong` | Lounge | Game focus and paddle indicator |
| `round_table` | Lounge | Existing standup callback |

## Safe manual verification

1. Select House in Studio Settings; reload and verify persistence.
2. Change its national flag, switch to Original, and verify the other theme's flag and furniture remain separate.
3. Click each actionable furniture type and verify its original overlay/callback. Do not unlock Treasury, send messages, place calls, edit cards or launch QA work merely to test a theme.
4. Intercept and abort the standup POST if testing its callback without authorization to start a meeting.
5. Verify lounge, gym and garden activity after arrival dwell. Actors need not visit every area in a short observation.
6. Verify water entry and safe exit when working status arrives; assert actual assigned computer coordinates and seated arrival, not only a green badge.
7. Check late roster hydration and repeat lifecycle updates without losing workstation capacity or idle dwell.
8. Check doorway traversal both directions and visually confirm no wall mesh spans the passage.
9. Return to Original and confirm its layout, movement and interaction behavior are unchanged.

Behavioral coverage and portable test commands are documented in [Office themes](office-themes.md). Browser fixtures are animation checks, not proof of real gateway or Kanban execution.
