import React, { useState } from 'react';
import { AdminAuditEntry, Table, TerrainBox, TableSize, TerrainCategory, User, Booking, SwapMeet, SwapMeetBooking } from '../types';
import * as firebaseService from '../services/firebaseService';
import { generateUUID } from '../utils';

interface AdminViewProps {
  tables: Table[];
  terrainBoxes: TerrainBox[];
  terrainAudit: AdminAuditEntry[];
  users: User[];
  allBookings: Booking[];
  cancelledDates: string[];
  specialEventDates: string[];
  swapMeets: SwapMeet[];
  swapMeetBookings: SwapMeetBooking[];
  onTablesChange: (tables: Table[]) => void;
  onTerrainChange: (terrainBoxes: TerrainBox[]) => Promise<void>;
  onUsersChange: () => void;
  onCancelledDatesChange: (dates: string[]) => void;
  onSpecialEventDatesChange: (dates: string[]) => void;
  onSwapMeetSave: (swapMeet: Pick<SwapMeet, 'id' | 'date' | 'stallCount'>) => Promise<void>;
  onSwapMeetDelete: (swapMeetId: string) => Promise<void>;
  onSwapMeetPaid: (bookingId: string) => Promise<void>;
  onSwapMeetInvoiced: (bookingId: string) => Promise<void>;
  onSwapMeetCancelled: (bookingId: string) => Promise<void>;
  onSwapMeetBookingsRefresh: () => Promise<void>;
  showSwapMeetTab: boolean;
  onShowSwapMeetTabChange: (showSwapMeetTab: boolean) => void;
  currentUser: User;
  gameSystems: string[];
  showToast?: (message: string) => void;
}

type AdminTab = 'dates' | 'users' | 'terrain' | 'tables' | 'gameSystems';

const defaultTable: Omit<Table, 'id'> = { name: '', size: TableSize.LARGE };
const defaultTerrain: Omit<TerrainBox, 'id'> = { name: '', category: TerrainCategory.SCIFI, imageUrl: '' };


const DragHandle: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
);

export const AdminView: React.FC<AdminViewProps> = ({ 
    tables, terrainBoxes, terrainAudit, users, allBookings, cancelledDates, specialEventDates, swapMeets, swapMeetBookings,
    onTablesChange, onTerrainChange, onUsersChange, onCancelledDatesChange, onSpecialEventDatesChange,
    showSwapMeetTab, onShowSwapMeetTabChange, onSwapMeetSave, onSwapMeetDelete,
    onSwapMeetPaid, onSwapMeetInvoiced, onSwapMeetCancelled, onSwapMeetBookingsRefresh,
    currentUser, gameSystems, showToast
}) => {
  const [editingTable, setEditingTable] = useState<Table | Partial<Table> | null>(null);
  const [editingTerrain, setEditingTerrain] = useState<TerrainBox | Partial<TerrainBox> | null>(null);
  const [userFilter, setUserFilter] = useState<'all' | 'pending' | 'member' | 'admin'>('all');
  const [userSearch, setUserSearch] = useState('');
  
  const [dateToCancel, setDateToCancel] = useState<string>(new Date().toISOString().split('T')[0]);
  const [specialDateToAdd, setSpecialDateToAdd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [renamingGame, setRenamingGame] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [gameRenameLoading, setGameRenameLoading] = useState(false);
  const [terrainImageFile, setTerrainImageFile] = useState<File | null>(null);
  const [terrainImageUploading, setTerrainImageUploading] = useState(false);
  const [terrainImageRemoving, setTerrainImageRemoving] = useState<string | null>(null);
  const [renewedThisSession] = useState(() => new Set<string>());
  const [editingExpiryUserId, setEditingExpiryUserId] = useState<string | null>(null);
  const [editingExpiryValue, setEditingExpiryValue] = useState<string>('');
  const [editingPaidUserId, setEditingPaidUserId] = useState<string | null>(null);
  const [editingPaidValue, setEditingPaidValue] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [selectedSwapMeetId, setSelectedSwapMeetId] = useState<string | null>(null);
  const [swapMeetDate, setSwapMeetDate] = useState(new Date().toISOString().split('T')[0]);
  const [swapMeetStallCount, setSwapMeetStallCount] = useState(30);
  const [swapMeetSaving, setSwapMeetSaving] = useState(false);
  const [viewingSwapMeet, setViewingSwapMeet] = useState<SwapMeet | null>(null);
  const [swapMeetActionBusyId, setSwapMeetActionBusyId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string, type: 'table' | 'terrain') => {
    e.dataTransfer.setData(type, id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedId(id);
  };

  const handleDragEnd = () => setDraggedId(null);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const recordTerrainAudit = async (
    action: string,
    terrain: TerrainBox,
    details?: string
  ) => {
    await firebaseService.addAdminAuditEntry({
      action,
      entityType: 'terrain',
      entityId: terrain.id,
      entityName: terrain.name,
      performedBy: currentUser.id,
      performedByName: currentUser.name,
      timestamp: Date.now(),
      ...(details ? { details } : {}),
    });
  };

  const handleTableDrop = (e: React.DragEvent, dropTargetId: string) => {
    e.preventDefault();
    const draggedItemId = e.dataTransfer.getData('table');
    if (!draggedItemId || draggedItemId === dropTargetId) return;
    const items = [...tables];
    const draggedIndex = items.findIndex(item => item.id === draggedItemId);
    const targetIndex = items.findIndex(item => item.id === dropTargetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const [reorderedItem] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, reorderedItem);
    onTablesChange(items.map((item, index) => ({ ...item, order: index })));
  };

  const handleTerrainDrop = (e: React.DragEvent, dropTargetId: string) => {
    e.preventDefault();
    const draggedItemId = e.dataTransfer.getData('terrain');
    if (!draggedItemId || draggedItemId === dropTargetId) return;
    const items = [...terrainBoxes];
    const draggedIndex = items.findIndex(item => item.id === draggedItemId);
    const targetIndex = items.findIndex(item => item.id === dropTargetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const [reorderedItem] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, reorderedItem);
    onTerrainChange(items.map((item, index) => ({ ...item, order: index })));
  };

  const handleSaveTable = () => {
    if (!editingTable || !editingTable.name) return;
    if ('id' in editingTable) { 
      onTablesChange(tables.map(t => t.id === editingTable.id ? editingTable as Table : t));
    } else { 
      const newTable = { ...editingTable, id: `custom-${generateUUID()}`, order: tables.length } as Table;
      onTablesChange([...tables, newTable]);
    }
    setEditingTable(null);
  };
  
  const handleDeleteTable = (id: string) => {
    if(confirm('Delete this table?')) onTablesChange(tables.filter(t => t.id !== id));
  }

  const handleSaveTerrain = async () => {
    if (!editingTerrain || !editingTerrain.name || !editingTerrain.category) return;
    let updatedTerrain: TerrainBox;
    if ('id' in editingTerrain) {
        updatedTerrain = editingTerrain as TerrainBox;
        await onTerrainChange(terrainBoxes.map(t => t.id === updatedTerrain.id ? updatedTerrain : t));
    } else {
        updatedTerrain = { ...editingTerrain, id: `custom-${generateUUID()}`, order: terrainBoxes.length } as TerrainBox;
        await onTerrainChange([...terrainBoxes, updatedTerrain]);
    }
    await recordTerrainAudit('saved', updatedTerrain);
    // Upload image if a file was selected
    if (terrainImageFile) {
        setTerrainImageUploading(true);
        try {
            await firebaseService.uploadTerrainImage(updatedTerrain.id, terrainImageFile);
        } catch (e) {
            console.error('Error uploading terrain image:', e);
            alert('Terrain saved but image upload failed. Check console.');
        } finally {
            setTerrainImageUploading(false);
        }
    }
    setTerrainImageFile(null);
    setEditingTerrain(null);
  }

  const handleRemoveTerrainImage = async (terrainId: string) => {
    if (!confirm('Remove the uploaded image for this terrain?')) return;
    setTerrainImageRemoving(terrainId);
    try {
        await firebaseService.removeTerrainImage(terrainId);
    } catch (e) {
        console.error('Error removing terrain image:', e);
        alert('Error removing image. Check console.');
    } finally {
        setTerrainImageRemoving(null);
    }
  }

  const handleDeleteTerrain = async (id: string) => {
    const terrain = terrainBoxes.find(box => box.id === id);
    if (!terrain || !confirm('Delete this terrain box?')) return;
    await onTerrainChange(terrainBoxes.filter(box => box.id !== id));
    await recordTerrainAudit('deleted', terrain);
  }

  const handleToggleTerrainDisabled = async (id: string) => {
    const terrain = terrainBoxes.find(box => box.id === id);
    if (!terrain) return;
    const updatedTerrain = { ...terrain, disabled: !terrain.disabled };
    await onTerrainChange(terrainBoxes.map(box => box.id === id ? updatedTerrain : box));
    await recordTerrainAudit(updatedTerrain.disabled ? 'disabled' : 'enabled', updatedTerrain);
  }

  const MAX_EXTENSION_MONTHS = 18; // Cap: membership can't extend more than 18 months from today

  const computeNewExpiry = (currentExpiryDate?: string): string => {
    const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
    const maxExpiry = new Date(today);
    maxExpiry.setMonth(maxExpiry.getMonth() + MAX_EXTENSION_MONTHS);

    let base: Date;
    if (currentExpiryDate) {
      const current = new Date(currentExpiryDate + 'T00:00:00');
      // If membership is still active, extend from current expiry; otherwise from today
      base = current > today ? current : today;
    } else {
      base = today;
    }

    const newExpiry = new Date(base);
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);
    newExpiry.setDate(newExpiry.getDate() + 1);

    // Cap at max extension
    if (newExpiry > maxExpiry) {
      return maxExpiry.toISOString().split('T')[0];
    }
    return newExpiry.toISOString().split('T')[0];
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateWithDay = (dateStr: string): string => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleSetRole = async (uid: string, role: 'pending' | 'member' | 'admin') => {
    if (uid === currentUser.id) return alert("Cannot change your own role.");
    try {
      const today = new Date().toISOString().split('T')[0];
      const targetUser = users.find(u => u.id === uid);
      const previousRole = targetUser ? getUserRole(targetUser) : 'pending';
      const updates: Record<string, unknown> = {
        isMember: role === 'member' || role === 'admin',
        isAdmin: role === 'admin',
      };
      if ((role === 'member' || role === 'admin') && !targetUser?.membershipPaidDate) {
        updates.membershipPaidDate = today;
        updates.membershipExpiryDate = computeNewExpiry(targetUser?.membershipExpiryDate);
        renewedThisSession.add(uid);
      }
      if (role === 'pending') {
        updates.membershipPaidDate = null;
        updates.membershipExpiryDate = null;
      }
      await firebaseService.updateUserProfile(uid, updates as Partial<User>);

      // Audit trail
      if (role === 'pending' && previousRole !== 'pending') {
        await firebaseService.addMembershipAuditEntry({
          userId: uid,
          action: 'cancelled',
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          timestamp: Date.now(),
        });
      } else if ((role === 'member' || role === 'admin') && previousRole === 'pending') {
        await firebaseService.addMembershipAuditEntry({
          userId: uid,
          action: 'activated',
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          timestamp: Date.now(),
        });
      }

      onUsersChange();
    } catch (e) {
      alert('Error updating user role. Check console.');
      console.error(e);
    }
  };

  const handleRenewMembership = async (uid: string) => {
    if (renewedThisSession.has(uid)) {
      alert('This membership has already been renewed. Reload the page to renew again.');
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const targetUser = users.find(u => u.id === uid);
      const newExpiry = computeNewExpiry(targetUser?.membershipExpiryDate);

      // Guard against accidental double-click
      if (targetUser?.membershipExpiryDate) {
        const currentExpiry = new Date(targetUser.membershipExpiryDate + 'T00:00:00');
        const maxExpiry = new Date(today + 'T00:00:00');
        maxExpiry.setMonth(maxExpiry.getMonth() + MAX_EXTENSION_MONTHS);
        if (currentExpiry >= maxExpiry) {
          alert(`Membership already extends to ${formatDate(targetUser.membershipExpiryDate)}, which is at or beyond the maximum allowed (${MAX_EXTENSION_MONTHS} months from today). Cannot extend further.`);
          return;
        }
      }

      await firebaseService.updateUserProfile(uid, {
        membershipPaidDate: today,
        membershipExpiryDate: newExpiry,
      } as Partial<User>);
      renewedThisSession.add(uid);
      await firebaseService.addMembershipAuditEntry({
        userId: uid,
        action: 'renewed',
        performedBy: currentUser.id,
        performedByName: currentUser.name,
        timestamp: Date.now(),
      });
      onUsersChange();
    } catch (e) {
      alert('Error renewing membership. Check console.');
      console.error(e);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser.id) return alert("Cannot delete self.");
    if(confirm('Delete this user? This only removes their profile data, not their authentication account.')) {
        alert("SECURITY WARNING: Deleting users from the client is insecure and often disabled. Please delete this user from the Firebase Authentication and Firestore consoles manually.");
        await firebaseService.deleteUser(id);
        onUsersChange();
    }
  };

  const handleSaveExpiryOverride = async (uid: string) => {
    const targetUser = users.find(u => u.id === uid);
    const oldExpiry = targetUser?.membershipExpiryDate ? formatDate(targetUser.membershipExpiryDate) : 'none';
    const newExpiry = formatDate(editingExpiryValue);
    if (!confirm(`Change expiry for ${targetUser?.name ?? 'this user'} from ${oldExpiry} to ${newExpiry}?`)) {
      return;
    }
    try {
      await firebaseService.updateUserProfile(uid, { membershipExpiryDate: editingExpiryValue } as Partial<User>);
      setEditingExpiryUserId(null);
      onUsersChange();
    } catch (e) {
      alert('Error updating expiry date. Check console.');
      console.error(e);
    }
  };

  const handleSavePaidOverride = async (uid: string) => {
    const targetUser = users.find(u => u.id === uid);
    const oldPaid = targetUser?.membershipPaidDate ? formatDate(targetUser.membershipPaidDate) : 'none';
    const newPaid = formatDate(editingPaidValue);
    if (!confirm(`Change paid date for ${targetUser?.name ?? 'this user'} from ${oldPaid} to ${newPaid}?`)) {
      return;
    }
    try {
      await firebaseService.updateUserProfile(uid, { membershipPaidDate: editingPaidValue } as Partial<User>);
      setEditingPaidUserId(null);
      onUsersChange();
    } catch (e) {
      alert('Error updating paid date. Check console.');
      console.error(e);
    }
  };

  const getUserRole = (u: User): 'pending' | 'member' | 'admin' => {
    if (u.isAdmin) return 'admin';
    if (u.isMember) return 'member';
    return 'pending';
  };

  const filteredUsers = (userFilter === 'all' ? users : users.filter(u => getUserRole(u) === userFilter))
    .filter(u => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  const pendingCount = users.filter(u => !u.isMember && !u.isAdmin).length;

  const handleCancelDate = () => {
    if (dateToCancel && !cancelledDates.includes(dateToCancel)) {
        onCancelledDatesChange([...cancelledDates, dateToCancel].sort());
    }
  };

  const handleReopenDate = (date: string) => {
    onCancelledDatesChange(cancelledDates.filter(d => d !== date));
  };
  
  const handleAddSpecialDate = () => {
    if (specialDateToAdd && !specialEventDates.includes(specialDateToAdd)) {
        onSpecialEventDatesChange([...specialEventDates, specialDateToAdd].sort());
    }
  };

  const handleRemoveSpecialDate = (date: string) => {
    onSpecialEventDatesChange(specialEventDates.filter(d => d !== date));
  };

  const selectSwapMeet = (swapMeet: SwapMeet) => {
    setSelectedSwapMeetId(swapMeet.id);
    setSwapMeetDate(swapMeet.date);
    setSwapMeetStallCount(swapMeet.stallCount);
  };

  const resetSwapMeetForm = () => {
    setSelectedSwapMeetId(null);
    setSwapMeetDate(new Date().toISOString().split('T')[0]);
    setSwapMeetStallCount(30);
  };

  const handleSaveSwapMeet = async () => {
    if (!swapMeetDate || swapMeetStallCount < 1) return;
    const selectedSwapMeet = swapMeets.find(swapMeet => swapMeet.id === selectedSwapMeetId);
    const today = new Date().toISOString().slice(0, 10);
    if (selectedSwapMeet && selectedSwapMeet.date < today) {
      alert('Past swap meets cannot be edited.');
      return;
    }
    if (swapMeets.some(swapMeet => swapMeet.date === swapMeetDate && swapMeet.id !== selectedSwapMeetId)) {
      alert('A swap meet is already scheduled for this date.');
      return;
    }
    if (selectedSwapMeet && !confirm('Save changes to this swap meet?')) return;
    setSwapMeetSaving(true);
    try {
      const id = selectedSwapMeetId ?? `swap-meet-${generateUUID()}`;
      await onSwapMeetSave({ id, date: swapMeetDate, stallCount: swapMeetStallCount });
      setSelectedSwapMeetId(id);
      showToast?.('Swap meet saved.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save swap meet.');
    } finally {
      setSwapMeetSaving(false);
    }
  };

  const handleDeleteSwapMeet = async (swapMeet: SwapMeet) => {
    const bookingCount = swapMeetBookings.filter(booking => (
      booking.swapMeetId === swapMeet.id && booking.status !== 'cancelled'
    )).length;
    if (bookingCount > 0) {
      alert('This swap meet has active bookings and cannot be deleted.');
      return;
    }
    if (!confirm(`Delete the swap meet on ${formatDateWithDay(swapMeet.date)}?`)) return;
    try {
      await onSwapMeetDelete(swapMeet.id);
      if (selectedSwapMeetId === swapMeet.id) resetSwapMeetForm();
      showToast?.('Swap meet deleted.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not delete swap meet.');
    }
  };

  const exportSwapMeetBookings = (swapMeet: SwapMeet) => {
    const bookings = swapMeetBookings.filter(booking => (
      booking.swapMeetId === swapMeet.id && booking.status !== 'cancelled'
    ));
    const escapeCell = (value: string | number | boolean) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = [
      ['swap_meet_date', 'name', 'email', 'half_tables', 'amount_owed', 'status', 'paid', 'invoiced', 'booked_at'],
      ...bookings.map(booking => {
        const bookingUser = users.find(user => user.id === booking.userId);
        return [
          swapMeet.date,
          bookingUser?.name ?? booking.userName,
          bookingUser?.email ?? '',
          booking.stallCount,
          booking.amountOwed,
          booking.status,
          booking.paid,
          booking.invoiced,
          new Date(booking.createdAt).toISOString(),
        ];
      }),
    ];
    const csv = rows.map(row => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swap-meet-${swapMeet.date}-bookings.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSwapMeetBookingAction = async (
    booking: SwapMeetBooking,
    action: (bookingId: string) => Promise<void>,
    confirmation?: string
  ) => {
    if (confirmation && !confirm(confirmation)) return;
    setSwapMeetActionBusyId(booking.id);
    try {
      await action(booking.id);
      await onSwapMeetBookingsRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not update swap meet booking.');
    } finally {
      setSwapMeetActionBusyId(null);
    }
  };

  const handleRenameGame = async (oldName: string) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) return;
    setGameRenameLoading(true);
    try {
      await firebaseService.renameGameSystem(oldName, newName);
      showToast?.(`Renamed "${oldName.trim()}" to "${newName.trim()}".`);
      setRenamingGame(null);
    } catch (e) {
      alert('Error renaming game system. Check console.');
      showToast?.('Failed to rename game system.');
      console.error(e);
    } finally {
      setGameRenameLoading(false);
    }
  };

  const handleDeleteGame = async (name: string) => {
    if (confirm(`Delete "${name}" from the game systems list? This will NOT remove it from existing bookings.`)) {
      try {
        await firebaseService.deleteGameSystem(name);
      } catch (e) {
        alert('Error deleting game system. Check console.');
        console.error(e);
      }
    }
  };

  // Render Helpers
  const renderTableForm = () => (
    <div className="bg-neutral-800 p-4 rounded-lg mt-4 border border-amber-700/50 space-y-3">
        <h3 className="font-bold text-amber-500">{'id' in (editingTable || {}) ? 'Edit Table' : 'Add New Table'}</h3>
        <input type="text" placeholder="Name" value={editingTable?.name} onChange={(e) => setEditingTable({...editingTable, name: e.target.value })} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white" />
        <select value={editingTable?.size} onChange={(e) => setEditingTable({...editingTable, size: e.target.value as TableSize })} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white">
            {Object.values(TableSize).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex gap-2">
            <button onClick={handleSaveTable} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded text-sm">Save</button>
            <button onClick={() => setEditingTable(null)} className="bg-neutral-700 text-white px-4 py-1.5 rounded text-sm">Cancel</button>
        </div>
    </div>
  )

  const renderTerrainForm = () => (
    <div className="bg-neutral-800 p-4 rounded-lg mt-4 border border-amber-700/50 space-y-3">
        <h3 className="font-bold text-amber-500">{'id' in (editingTerrain || {}) ? 'Edit Terrain' : 'Add New Terrain'}</h3>
        <input type="text" placeholder="Name" value={editingTerrain?.name} onChange={(e) => setEditingTerrain({...editingTerrain, name: e.target.value })} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white" />
        <select value={editingTerrain?.category} onChange={(e) => setEditingTerrain({...editingTerrain, category: e.target.value as TerrainCategory })} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white">
            {Object.values(TerrainCategory).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-400 whitespace-nowrap">Max bookings per night</label>
            <input
                type="number"
                min="1"
                step="1"
                value={editingTerrain?.maxBookingsPerNight ?? 1}
                onChange={(e) => setEditingTerrain({ ...editingTerrain, maxBookingsPerNight: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                className="w-24 bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white"
            />
            <span className="text-xs text-neutral-500">Use 1 for standard single-booking terrain.</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input
                type="checkbox"
                checked={Boolean(editingTerrain?.allowAsSecondItem)}
                onChange={(e) => setEditingTerrain({ ...editingTerrain, allowAsSecondItem: e.target.checked })}
                className="rounded border-neutral-600 bg-neutral-900 text-amber-500"
            />
            Allow booking as a second item alongside other terrain sets
        </label>
        <input type="text" placeholder="Image URL (fallback)" value={editingTerrain?.imageUrl} onChange={(e) => setEditingTerrain({...editingTerrain, imageUrl: e.target.value })} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white" />
        <div>
            <label className="block text-xs text-neutral-400 mb-1">Upload Image {editingTerrain?.uploadedImageUrl ? '(will replace current)' : '(optional, overrides URL above)'}</label>
            <input
                type="file"
                accept="image/*"
                onChange={(e) => setTerrainImageFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-amber-600 file:text-white hover:file:bg-amber-700 file:cursor-pointer"
            />
            {terrainImageFile && (
                <p className="text-xs text-green-400 mt-1">Selected: {terrainImageFile.name}</p>
            )}
            {editingTerrain?.uploadedImageUrl && !terrainImageFile && (
                <p className="text-xs text-neutral-400 mt-1">Current uploaded image will be kept.</p>
            )}
        </div>
        <div className="flex gap-2">
            <button onClick={handleSaveTerrain} disabled={terrainImageUploading} className="bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white px-4 py-1.5 rounded text-sm">
                {terrainImageUploading ? 'Uploading...' : 'Save'}
            </button>
            <button onClick={() => { setEditingTerrain(null); setTerrainImageFile(null); }} className="bg-neutral-700 text-white px-4 py-1.5 rounded text-sm">Cancel</button>
        </div>
    </div>
  )



  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-amber-500">Admin Panel</h1>
      <div className="flex gap-2 overflow-x-auto border-b border-neutral-700 pb-3" role="tablist" aria-label="Admin sections">
        {([
          ['users', 'Users'],
          ['dates', 'Club Dates'],
          ['terrain', 'Terrain'],
          ['tables', 'Tables'],
          ['gameSystems', 'Game Systems'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-amber-600 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Schedule */}
      {activeTab === 'dates' && <div className="bg-neutral-800/50 rounded-xl p-6 border border-neutral-700">
        <h2 className="text-xl font-bold mb-4">Manage Schedule</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
                <h3 className="text-lg font-bold text-amber-500 mb-2">Add Special Date</h3>
                <div className="flex gap-2 items-center bg-neutral-800 p-3 rounded-lg">
                    <input type="date" value={specialDateToAdd} onChange={e => setSpecialDateToAdd(e.target.value)} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white" />
                    <button onClick={handleAddSpecialDate} className="bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded text-sm">Add</button>
                </div>
                 <div className="space-y-2 mt-2 bg-neutral-800 p-3 rounded-lg">
                    {specialEventDates.map(date => (
                        <div key={date} className="flex justify-between items-center bg-neutral-900 p-2 rounded">
                            <span className="text-neutral-300">{formatDateWithDay(date)}</span>
                            <button onClick={() => handleRemoveSpecialDate(date)} className="text-xs text-red-400 font-bold">X</button>
                        </div>
                    ))}
                 </div>
            </div>
            <div>
                <h3 className="text-lg font-bold text-amber-500 mb-2">Cancel Date</h3>
                <div className="flex gap-2 items-center bg-neutral-800 p-3 rounded-lg">
                    <input type="date" value={dateToCancel} onChange={e => setDateToCancel(e.target.value)} className="w-full bg-neutral-900 border border-neutral-600 rounded px-3 py-2 text-white" />
                    <button onClick={handleCancelDate} className="bg-red-800 hover:bg-red-700 text-white px-4 py-2 rounded text-sm">Cancel</button>
                </div>
            </div>
            <div>
                 <h3 className="text-lg font-bold text-amber-500 mb-2">Cancelled Dates</h3>
                 <div className="space-y-2 bg-neutral-800 p-3 rounded-lg">
                    {cancelledDates.map(date => (
                        <div key={date} className="flex justify-between items-center bg-neutral-900 p-2 rounded">
                            <span className="text-neutral-300">{formatDateWithDay(date)}</span>
                            <button onClick={() => handleReopenDate(date)} className="text-xs text-green-400 font-bold">REMOVE</button>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
        <label className="mt-6 flex items-center gap-3 border-t border-neutral-700 pt-5 text-neutral-200">
            <input
                type="checkbox"
                checked={showSwapMeetTab}
                onChange={event => onShowSwapMeetTabChange(event.target.checked)}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-900 text-amber-600 focus:ring-amber-500"
            />
            <span>Show Swap Meet Tab</span>
        </label>
        <section className="mt-8 border-t border-neutral-700 pt-6">
          <div>
            <h2 className="text-xl font-bold text-white">Swap Meet Schedule</h2>
            <p className="mt-1 text-sm text-neutral-400">Set the date and number of half-tables available for each swap meet.</p>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="text-sm text-neutral-300">
              Swap meet date
              <input type="date" value={swapMeetDate} onChange={event => setSwapMeetDate(event.target.value)} className="mt-1 w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-neutral-300">
              Half-tables available
              <input type="number" min="1" value={swapMeetStallCount} onChange={event => setSwapMeetStallCount(Math.max(1, Number(event.target.value)))} className="mt-1 w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-white" />
            </label>
            <div className="flex gap-2">
              <button onClick={handleSaveSwapMeet} disabled={swapMeetSaving} className="rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:bg-neutral-700">
                {swapMeetSaving ? 'Saving...' : selectedSwapMeetId ? 'Save Changes' : 'Create Swap Meet'}
              </button>
              {selectedSwapMeetId && <button onClick={resetSwapMeetForm} className="rounded bg-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-600">Cancel Edit</button>}
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {swapMeets.length === 0 && <p className="text-sm text-neutral-500">No swap meets are scheduled.</p>}
            {swapMeets.map(swapMeet => {
              const meetBookings = swapMeetBookings.filter(booking => booking.swapMeetId === swapMeet.id);
              const activeMeetBookings = meetBookings.filter(booking => booking.status !== 'cancelled');
              const bookingCount = activeMeetBookings.length;
              const hasActiveBookings = activeMeetBookings.length > 0;
              const bookedStallCount = activeMeetBookings
                .reduce((total, booking) => total + booking.stallCount, 0);
              const isUpcoming = swapMeet.date >= new Date().toISOString().slice(0, 10);
              return (
                <div key={swapMeet.id} role="button" tabIndex={0} onClick={() => setViewingSwapMeet(swapMeet)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setViewingSwapMeet(swapMeet); }} className="flex cursor-pointer flex-col gap-3 rounded-lg border border-neutral-700 bg-neutral-800 p-3 transition-colors hover:bg-neutral-700 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-white">{formatDateWithDay(swapMeet.date)}</p>
                    <p className="text-sm text-neutral-400">{bookedStallCount} of {swapMeet.stallCount} half-tables booked · {bookingCount} bookings</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={event => { event.stopPropagation(); selectSwapMeet(swapMeet); }} disabled={!isUpcoming} className="rounded bg-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-600 disabled:cursor-not-allowed disabled:bg-neutral-700/50 disabled:text-neutral-500">Edit</button>
                    <button onClick={event => { event.stopPropagation(); handleDeleteSwapMeet(swapMeet); }} disabled={hasActiveBookings} title={hasActiveBookings ? 'Swap meets with active bookings cannot be deleted' : undefined} className="rounded bg-red-900/60 px-3 py-1.5 text-sm text-red-100 hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        {viewingSwapMeet && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Swap meet bookings">
            <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
              <div className="flex flex-col gap-3 border-b border-neutral-700 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Swap Meet Bookings</h2>
                  <p className="mt-1 text-neutral-400">{formatDateWithDay(viewingSwapMeet.date)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportSwapMeetBookings(viewingSwapMeet)} className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700">Export CSV</button>
                  <button onClick={() => setViewingSwapMeet(null)} className="rounded bg-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-600">Close</button>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-700 text-neutral-400">
                    <tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Half-tables</th><th className="py-2 pr-4">Owes</th><th className="py-2 pr-4">Paid</th><th className="py-2 pr-4">Invoiced</th><th className="py-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {swapMeetBookings.filter(booking => booking.swapMeetId === viewingSwapMeet.id && booking.status !== 'cancelled').map(booking => {
                      const bookingUser = users.find(user => user.id === booking.userId);
                      const isActive = booking.status !== 'cancelled';
                      const isBusy = swapMeetActionBusyId === booking.id;
                      return <tr key={booking.id} className="border-b border-neutral-800 text-neutral-200"><td className="py-3 pr-4">{bookingUser?.name ?? booking.userName}</td><td className="py-3 pr-4">{bookingUser?.email ?? 'Unknown'}</td><td className="py-3 pr-4">{booking.stallCount}</td><td className="py-3 pr-4">${booking.amountOwed}</td><td className="py-3 pr-4">{booking.paid ? 'Yes' : 'No'}</td><td className="py-3 pr-4">{booking.invoiced ? 'Yes' : 'No'}</td><td className="py-3"><div className="flex flex-wrap gap-2"><button onClick={() => handleSwapMeetBookingAction(booking, onSwapMeetPaid)} disabled={isBusy || booking.paid || !isActive} className="rounded bg-green-800 px-2 py-1 text-xs text-green-100 hover:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500">Paid</button><button onClick={() => handleSwapMeetBookingAction(booking, onSwapMeetInvoiced)} disabled={isBusy || booking.invoiced || !isActive} className="rounded bg-amber-700 px-2 py-1 text-xs text-white hover:bg-amber-600 disabled:bg-neutral-700 disabled:text-neutral-500">Invoice</button><button onClick={() => handleSwapMeetBookingAction(booking, onSwapMeetCancelled, 'Cancel this swap meet booking?')} disabled={isBusy || !isActive} className="rounded bg-red-900/60 px-2 py-1 text-xs text-red-100 hover:bg-red-900 disabled:bg-neutral-700 disabled:text-neutral-500">Cancel</button></div></td></tr>;
                    })}
                    {swapMeetBookings.filter(booking => booking.swapMeetId === viewingSwapMeet.id && booking.status !== 'cancelled').length === 0 && <tr><td colSpan={7} className="py-8 text-center text-neutral-500">No bookings for this swap meet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>}
      {/* Users */}
      {activeTab === 'users' && <div className="bg-neutral-800/50 rounded-xl p-6 border border-neutral-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
            <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">Manage Users ({users.length})</h2>
                {pendingCount > 0 && (
                    <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">{pendingCount} unpaid</span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:ring-1 focus:ring-amber-500 focus:outline-none w-48 md:w-64"
                />
                <div className="flex gap-1 bg-neutral-900 rounded-lg p-1">
                    {(['all', 'pending', 'member', 'admin'] as const).map(f => (
                        <button key={f} onClick={() => setUserFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${userFilter === f ? 'bg-amber-600 text-white' : 'text-neutral-400 hover:text-white'}`}>
                            {f === 'all' ? `All (${users.length})` : f === 'pending' ? `Unpaid (${users.filter(u => !u.isMember && !u.isAdmin).length})` : f === 'member' ? `Paid (${users.filter(u => u.isMember && !u.isAdmin).length})` : `Admins (${users.filter(u => u.isAdmin).length})`}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        <div className="mt-4 space-y-2">
            {filteredUsers.length === 0 && (
                <div className="text-center py-8 text-neutral-500">No users in this category.</div>
            )}
            {filteredUsers.map(u => {
                const role = getUserRole(u);
                const isSelf = u.id === currentUser.id;
                return (
                    <div key={u.id} className={`flex flex-col md:flex-row md:items-center justify-between bg-neutral-800 p-3 rounded-lg border ${role === 'pending' ? 'border-amber-700/40' : 'border-neutral-700'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${role === 'admin' ? 'bg-amber-600 text-black' : role === 'member' ? 'bg-green-800 text-green-200' : 'bg-neutral-700 text-neutral-400'}`}>
                                {u.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-white truncate">{u.name}</span>
                                    {isSelf && <span className="text-xs text-neutral-500">(you)</span>}
                                    {role === 'pending' && <span className="text-xs text-orange-400 bg-orange-900/50 px-2 py-0.5 rounded-full border border-orange-800">Unpaid Member</span>}
                                    {role === 'member' && <span className="text-xs text-green-400 bg-green-900/50 px-2 py-0.5 rounded-full border border-green-800">Paid Member</span>}
                                    {role === 'admin' && <span className="text-xs text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded-full border border-amber-800">Admin</span>}
                                </div>
                                <span className="text-xs text-neutral-500 truncate block">{u.email}</span>
                                <div className="flex gap-3 mt-1">
                                  <span className="text-xs text-neutral-500">Bookings: <span className="text-neutral-300">{allBookings.filter(b => b.memberId === u.id && b.status === 'active').length}</span></span>
                                  <span className="text-xs text-neutral-500">Cancellations: <span className="text-neutral-300">{allBookings.filter(b => b.memberId === u.id && b.status === 'cancelled' && b.cancelledBy === u.id).length}</span></span>
                                </div>
                                {u.membershipPaidDate && (role === 'member' || role === 'admin') && (
                                  <div className="flex gap-3 mt-1 items-center flex-wrap">
                                    {editingPaidUserId !== u.id && (
                                      <span className="text-xs text-neutral-500 flex items-center gap-1">Paid: <span className="text-neutral-300">{formatDate(u.membershipPaidDate)}</span>
                                        <button onClick={() => { setEditingPaidUserId(u.id); setEditingPaidValue(u.membershipPaidDate!); }} className="text-neutral-500 hover:text-amber-400 transition-colors" title="Edit paid date">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                      </span>
                                    )}
                                    {editingPaidUserId === u.id && (
                                      <span className="flex items-center gap-1">
                                        <span className="text-xs text-neutral-500">Paid:</span>
                                        <input type="date" value={editingPaidValue} onChange={e => setEditingPaidValue(e.target.value)} className="bg-neutral-900 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white" />
                                        <button onClick={() => handleSavePaidOverride(u.id)} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded">Save</button>
                                        <button onClick={() => setEditingPaidUserId(null)} className="text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 px-2 py-0.5 rounded">Cancel</button>
                                      </span>
                                    )}
                                    {u.membershipExpiryDate && editingExpiryUserId !== u.id && (
                                      <span className="text-xs text-neutral-500 flex items-center gap-1">Expires: <span className={`${new Date(u.membershipExpiryDate + 'T00:00:00') < new Date() ? 'text-red-400' : 'text-neutral-300'}`}>{formatDate(u.membershipExpiryDate)}</span>
                                        <button onClick={() => { setEditingExpiryUserId(u.id); setEditingExpiryValue(u.membershipExpiryDate!); }} className="text-neutral-500 hover:text-amber-400 transition-colors" title="Edit expiry date">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                      </span>
                                    )}
                                    {editingExpiryUserId === u.id && (
                                      <span className="flex items-center gap-1">
                                        <input type="date" value={editingExpiryValue} onChange={e => setEditingExpiryValue(e.target.value)} className="bg-neutral-900 border border-neutral-600 rounded px-1.5 py-0.5 text-xs text-white" />
                                        <button onClick={() => handleSaveExpiryOverride(u.id)} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded">Save</button>
                                        <button onClick={() => setEditingExpiryUserId(null)} className="text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 px-2 py-0.5 rounded">Cancel</button>
                                      </span>
                                    )}
                                  </div>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2 mt-2 md:mt-0 flex-shrink-0 flex-wrap">
                            {isSelf && (role === 'member' || role === 'admin') && (
                                <button onClick={() => handleRenewMembership(u.id)} className="text-xs bg-green-800 hover:bg-green-700 text-green-100 px-3 py-1.5 rounded font-medium transition-colors">Renew Membership</button>
                            )}
                            {!isSelf && (
                              <>
                                {role === 'pending' && (
                                    <button onClick={() => handleSetRole(u.id, 'member')} className="text-xs bg-green-800 hover:bg-green-700 text-green-100 px-3 py-1.5 rounded font-medium transition-colors">Mark as Paid</button>
                                )}
                                {(role === 'member' || role === 'admin') && (
                                    <button onClick={() => handleRenewMembership(u.id)} className="text-xs bg-green-800 hover:bg-green-700 text-green-100 px-3 py-1.5 rounded font-medium transition-colors">Renew Membership</button>
                                )}
                                {role === 'member' && (
                                    <button onClick={() => handleSetRole(u.id, 'admin')} className="text-xs bg-amber-800 hover:bg-amber-700 text-amber-100 px-3 py-1.5 rounded font-medium transition-colors">Make Admin</button>
                                )}
                                {role === 'admin' && (
                                    <button onClick={() => handleSetRole(u.id, 'member')} className="text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-3 py-1.5 rounded font-medium transition-colors">Remove Admin Status</button>
                                )}
                                {role !== 'pending' && (
                                    <button onClick={() => handleSetRole(u.id, 'pending')} className="text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 px-3 py-1.5 rounded font-medium transition-colors">Remove Membership</button>
                                )}
                                <button onClick={() => handleDeleteUser(u.id)} className="text-xs bg-red-900/50 hover:bg-red-900 text-red-300 px-3 py-1.5 rounded font-medium transition-colors">Delete</button>
                              </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>}
      {/* Tables */}
      {activeTab === 'tables' && <div className="bg-neutral-800/50 rounded-xl p-6 border border-neutral-700">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Manage Tables ({tables.length})</h2>
            <button onClick={() => setEditingTable(defaultTable)} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm">+ Add Table</button>
        </div>
        {editingTable && renderTableForm()}
        <div className="mt-4 space-y-2">
            {tables.map(table => (
                <div key={table.id} draggable onDragStart={(e) => handleDragStart(e, table.id, 'table')} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDrop={(e) => handleTableDrop(e, table.id)} className={`flex items-center justify-between bg-neutral-800 p-2 rounded ${draggedId === table.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2"><div className="cursor-grab text-neutral-500 p-1"><DragHandle /></div><span className="font-medium">{table.name}</span><span className="text-xs text-neutral-400 ml-2 bg-neutral-700 px-2 py-0.5 rounded-full">{table.size}</span></div>
                    <div className="flex gap-2"><button onClick={() => setEditingTable(table)} className="text-xs text-neutral-400">Edit</button><button onClick={() => handleDeleteTable(table.id)} className="text-xs text-red-500">Delete</button></div>
                </div>
            ))}
        </div>
      </div>}
      {/* Terrain */}
      {activeTab === 'terrain' && <div className="bg-neutral-800/50 rounded-xl p-6 border border-neutral-700">
        <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Manage Terrain ({terrainBoxes.length})</h2><button onClick={() => setEditingTerrain(defaultTerrain)} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm">+ Add Terrain</button></div>
        {editingTerrain && renderTerrainForm()}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-4">
            {terrainBoxes.map(box => (
                <div key={box.id} draggable onDragStart={(e) => handleDragStart(e, box.id, 'terrain')} onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDrop={(e) => handleTerrainDrop(e, box.id)} className={`bg-neutral-800 rounded-lg overflow-hidden border relative ${box.disabled ? 'border-red-900/50 opacity-60' : 'border-neutral-700'} ${draggedId === box.id ? 'opacity-40' : ''}`}>
                    <div className="absolute top-2 left-2 cursor-grab text-neutral-300 bg-black/30 rounded-full p-1 z-10"><DragHandle /></div>
                    <div className="absolute top-2 right-2 z-10 flex gap-1">
                        {box.disabled && <span className="text-[9px] bg-red-900 text-red-200 px-1.5 py-0.5 rounded-full border border-red-800">Disabled</span>}
                        {box.uploadedImageUrl && <span className="text-[9px] bg-green-800 text-green-200 px-1.5 py-0.5 rounded-full border border-green-700">Uploaded</span>}
                    </div>
                    <img src={box.uploadedImageUrl || box.imageUrl} alt={box.name} className={`w-full h-32 object-cover ${box.disabled ? 'grayscale' : ''}`} />
                    <div className="p-3"><p className="font-bold text-sm truncate">{box.name}</p><p className="text-xs text-neutral-400">{box.category}</p><p className="text-xs text-amber-400 mt-1">Capacity: {box.maxBookingsPerNight ?? 1} per night</p>{box.allowAsSecondItem && <p className="text-xs text-green-400 mt-1">Can be added as a second item</p>}<div className="flex gap-3 mt-3 flex-wrap"><button onClick={() => setEditingTerrain(box)} className="text-xs text-neutral-400">Edit</button><button onClick={() => handleToggleTerrainDisabled(box.id)} className={`text-xs ${box.disabled ? 'text-green-400 hover:text-green-300' : 'text-yellow-400 hover:text-yellow-300'}`}>{box.disabled ? 'Enable' : 'Disable'}</button>{box.uploadedImageUrl && (<button onClick={() => handleRemoveTerrainImage(box.id)} disabled={terrainImageRemoving === box.id} className="text-xs text-orange-400 hover:text-orange-300 disabled:text-neutral-600">{terrainImageRemoving === box.id ? 'Removing...' : 'Remove Image'}</button>)}<button onClick={() => handleDeleteTerrain(box.id)} className="text-xs text-red-500">Delete</button></div></div>
                </div>
            ))}
        </div>
        <section className="mt-8 border-t border-neutral-700 pt-5">
          <h3 className="text-lg font-bold text-white">Recent Terrain Changes</h3>
          {terrainAudit.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No terrain changes have been recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {terrainAudit.map(entry => (
                <div key={entry.id} className="flex flex-col gap-1 rounded bg-neutral-800 p-3 text-sm md:flex-row md:items-center md:justify-between">
                  <span><span className="font-medium text-white">{entry.entityName}</span> <span className="text-neutral-400">was {entry.action} by {entry.performedByName}</span></span>
                  <span className="text-xs text-neutral-500">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>}
      {/* Game Systems */}
      {activeTab === 'gameSystems' && <div className="bg-neutral-800/50 rounded-xl p-6 border border-neutral-700">
        <h2 className="text-xl font-bold mb-4">Manage Game Systems ({gameSystems.length})</h2>
        <p className="text-sm text-neutral-400 mb-4">Rename game systems to normalize data across all bookings. Renaming will update all existing bookings that use the old name.</p>
        {gameSystems.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">No game systems yet. They are created automatically when members make bookings.</div>
        ) : (
          <div className="space-y-2">
            {gameSystems.map(name => (
              <div key={name} className="flex items-center justify-between bg-neutral-800 p-3 rounded-lg border border-neutral-700">
                {renamingGame === name ? (
                  <div className="flex items-center gap-2 flex-grow mr-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-grow bg-neutral-900 border border-neutral-600 rounded px-3 py-1.5 text-white text-sm focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameGame(name);
                        } else if (e.key === 'Escape') {
                          setRenamingGame(null);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleRenameGame(name)}
                      disabled={gameRenameLoading || !renameValue.trim() || renameValue.trim() === name}
                      className="text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white px-3 py-1.5 rounded font-medium transition-colors"
                    >
                      {gameRenameLoading ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setRenamingGame(null)} className="text-xs bg-neutral-700 text-white px-3 py-1.5 rounded font-medium">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-white">{name}</span>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setRenamingGame(name); setRenameValue(name); }}
                        className="text-xs text-neutral-400 hover:text-white transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteGame(name)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  );
};
