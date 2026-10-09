import {it,expect} from 'vitest';import fs from 'node:fs';
it('House atmosphere uses the full campus footprint so Original perimeter trees never spill into its corridor',()=>{
 const source=fs.readFileSync('src/features/retro-office/RetroOffice3D.tsx','utf8');const atmosphere=source.slice(source.indexOf('<SceneAtmosphere'),source.indexOf('/>',source.indexOf('<SceneAtmosphere')));
 expect(atmosphere).toContain('remoteOfficeEnabled || officeTheme === "dellanio-house"');
});
