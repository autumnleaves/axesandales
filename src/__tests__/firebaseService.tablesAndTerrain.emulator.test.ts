import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addAdminAuditEntry,
  removeTerrainImage,
  saveTablesToDb,
  saveTerrainBoxesToDb,
  subscribeTables,
  subscribeTerrainAudit,
  subscribeTerrainBoxes,
  uploadTerrainImage,
} from '../services/firebaseService';
import { waitFor } from './emulatorTestUtils';
import { TableSize, TerrainCategory, type AdminAuditEntry, type Table, type TerrainBox } from '../types';

// Node has no FileReader (it's a browser API); fileToDataUrl.ts needs one,
// so this minimal stub lets the real upload code path run end-to-end.
class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(file: File) {
    file.arrayBuffer().then((buffer) => {
      this.result = `data:${file.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.();
    });
  }
}

describe('firebaseService tables & terrain (Firestore emulator)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves tables and removes ones no longer present', async () => {
    const initial: Table[] = [
      { id: 'L1', name: 'Long Table 1', size: TableSize.LARGE },
      { id: 'S1', name: 'Small Table 1', size: TableSize.SMALL },
    ];
    await saveTablesToDb(initial);

    let latest: Table[] | undefined;
    const unsubscribe = subscribeTables((tables) => { latest = tables; });
    await waitFor(() => latest !== undefined && latest.length === 2);
    expect(latest!.map((t) => t.id)).toEqual(['L1', 'S1']);

    await saveTablesToDb([initial[0]]);
    await waitFor(() => latest !== undefined && latest.length === 1);
    expect(latest!.map((t) => t.id)).toEqual(['L1']);
    unsubscribe();
  });

  it('saves terrain boxes and removes ones no longer present', async () => {
    const box: TerrainBox = {
      id: 'terrain-1',
      category: TerrainCategory.FANTASY,
      name: 'Ruins',
      imageUrl: 'https://example.com/ruins.png',
    };
    await saveTerrainBoxesToDb([box]);

    let latest: TerrainBox[] | undefined;
    const unsubscribe = subscribeTerrainBoxes((boxes) => { latest = boxes; });
    await waitFor(() => latest !== undefined && latest.length === 1);
    expect(latest![0]).toMatchObject({ id: 'terrain-1', name: 'Ruins' });

    await saveTerrainBoxesToDb([]);
    await waitFor(() => latest !== undefined && latest.length === 0);
    unsubscribe();
  });

  it('uploads a terrain image as a base64 data URL and can remove it again', async () => {
    vi.stubGlobal('FileReader', FakeFileReader);
    const box: TerrainBox = {
      id: 'terrain-2',
      category: TerrainCategory.SCIFI,
      name: 'Bunker',
      imageUrl: 'https://example.com/bunker.png',
    };
    await saveTerrainBoxesToDb([box]);

    const file = new File(['fake-image-bytes'], 'bunker.png', { type: 'image/png' });
    const dataUrl = await uploadTerrainImage('terrain-2', file);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);

    let latest: TerrainBox[] | undefined;
    const unsubscribe = subscribeTerrainBoxes((boxes) => { latest = boxes; });
    await waitFor(() => latest !== undefined && latest[0]?.uploadedImageUrl === dataUrl);

    await removeTerrainImage('terrain-2');
    await waitFor(() => latest !== undefined && latest[0]?.uploadedImageUrl == null);
    unsubscribe();
  });

  it('records and subscribes to terrain admin audit entries', async () => {
    await addAdminAuditEntry({
      action: 'uploaded_image',
      entityType: 'terrain',
      entityId: 'terrain-2',
      entityName: 'Bunker',
      performedBy: 'admin-1',
      performedByName: 'Admin One',
      timestamp: Date.now(),
    });

    let latest: AdminAuditEntry[] | undefined;
    const unsubscribe = subscribeTerrainAudit((entries) => { latest = entries; });
    await waitFor(() => latest !== undefined && latest.length === 1);
    expect(latest![0].entityId).toBe('terrain-2');
    unsubscribe();
  });
});
