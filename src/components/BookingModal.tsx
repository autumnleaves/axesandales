import React, { useState, useEffect, useRef } from 'react';
import { Booking, User, Table, TerrainBox } from '../types';
import { Autocomplete } from './Autocomplete';
import { validateBooking, createBookingFromInput, getTerrainBoxStatus } from '../services/bookingService';
import { applyMarkedUnavailableToggle } from '../utils/bookingFlowHelpers';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (booking: Booking) => Promise<void>;
  user: User;
  editingBooking?: Booking | null;
  tables: Table[];
  terrainBoxes: TerrainBox[];
  cancelledDates: string[];
  bookableDates: string[];
  initialDate: string;
  allBookings: Booking[];
  gameSystems: string[];
  allUsers: User[];
}

export const BookingModal: React.FC<BookingModalProps> = ({ 
    isOpen, onClose, onSave, user, editingBooking, tables, 
    terrainBoxes, cancelledDates, bookableDates, initialDate, allBookings,
    gameSystems, allUsers 
}) => {
  const [date, setDate] = useState(editingBooking?.date || initialDate || bookableDates[0]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedTerrainId, setSelectedTerrainId] = useState<string>('');
  const [selectedSecondaryTerrainId, setSelectedSecondaryTerrainId] = useState<string>('');
  const [gameSystem, setGameSystem] = useState('');
  const [playerCount, setPlayerCount] = useState(2);
  const [playerCountManuallySet, setPlayerCountManuallySet] = useState(false);
  const [markedUnavailable, setMarkedUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [taggedPlayerIds, setTaggedPlayerIds] = useState<string[]>([]);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [isPlayerDropdownOpen, setIsPlayerDropdownOpen] = useState(false);
  const playerSearchRef = useRef<HTMLDivElement>(null);
  
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [unavailableTables, setUnavailableTables] = useState<Map<string, string>>(new Map());
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const secondItemTerrainBoxes = terrainBoxes.filter(box => !box.disabled && box.allowAsSecondItem);

  useEffect(() => {
    if (!isOpen) {
        setConfirmedBooking(null);
        return;
    }
    if (isOpen) {
        // Don't reset form state while showing the confirmation screen
        if (confirmedBooking) return;
        if (editingBooking) {
            setDate(editingBooking.date);
            setSelectedTableId(editingBooking.tableId);
            setSelectedTerrainId(editingBooking.terrainBoxId || '');
            setSelectedSecondaryTerrainId(editingBooking.secondaryTerrainId || '');
            setGameSystem(editingBooking.markedUnavailable ? 'Unavailable' : editingBooking.gameSystem);
            setPlayerCount(editingBooking.markedUnavailable ? 0 : editingBooking.playerCount);
            setPlayerCountManuallySet(Boolean(editingBooking.markedUnavailable));
            setTaggedPlayerIds(editingBooking.markedUnavailable ? [] : editingBooking.taggedPlayerIds);
            setMarkedUnavailable(Boolean(editingBooking.markedUnavailable));
        } else {
            setGameSystem('');
            setSelectedTableId('');
            setSelectedTerrainId('');
            setSelectedSecondaryTerrainId('');
            setPlayerCount(2);
            setPlayerCountManuallySet(false);
            setTaggedPlayerIds([]);
            setMarkedUnavailable(false);
            setDate(bookableDates.includes(initialDate) ? initialDate : bookableDates[0]);
        }
        setActiveCategory('All');
        setPlayerSearchQuery('');
        setIsPlayerDropdownOpen(false);
        setError('');
        setConfirmedBooking(null);
    }
  }, [isOpen, editingBooking, initialDate, bookableDates, confirmedBooking]);

  useEffect(() => {
    const bookings = allBookings.filter(b => b.date === date);
    const takenTables = new Map<string, string>();

    bookings.forEach(b => {
        if (editingBooking && b.id === editingBooking.id) return;
        takenTables.set(b.tableId, b.memberName);
    });

    setUnavailableTables(takenTables);
  }, [date, editingBooking, isOpen, allBookings]);

  // Close player dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (playerSearchRef.current && !playerSearchRef.current.contains(e.target as Node)) {
        setIsPlayerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    const input = {
      date,
      tableId: selectedTableId,
      terrainBoxId: selectedTerrainId,
      secondaryTerrainId: selectedSecondaryTerrainId,
      gameSystem,
      playerCount,
      taggedPlayerIds,
      markedUnavailable,
    };

    const validation = validateBooking(input, {
      cancelledDates,
      user,
      existingBookings: allBookings,
      terrainBoxes,
      editingBookingId: editingBooking?.id,
    });

    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    const newBooking = createBookingFromInput(input, user, editingBooking);
    try {
      await onSave(newBooking);
      if (editingBooking) {
        onClose();
      } else {
        setConfirmedBooking(newBooking);
      }
    } catch (err: unknown) {
      console.error('Failed to save booking:', err);
      if (err instanceof Error && err.name === 'BookingConflictError') {
        setError(err.message);
      } else {
        setError('Failed to save booking. Please try again.');
      }
    }
  };

  if (!isOpen) return null;

  if (confirmedBooking) {
    const bookedTable = tables.find(t => t.id === confirmedBooking.tableId);
    const bookedTerrain = confirmedBooking.terrainBoxId ? terrainBoxes.find(b => b.id === confirmedBooking.terrainBoxId) : null;
    const displayDate = new Date(confirmedBooking.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const tagged = confirmedBooking.taggedPlayerIds.map(id => allUsers.find(u => u.id === id)?.name).filter(Boolean);
    const confirmationMessage = confirmedBooking.markedUnavailable
      ? 'This unavailable hold has been saved successfully.'
      : 'Your table has been reserved successfully.';
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-2 md:p-4 flex items-center justify-center">
        <div className="bg-neutral-800 rounded-xl shadow-2xl max-w-md w-full border border-neutral-700 overflow-hidden mx-auto">
          <div className="p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Booking Confirmed!</h2>
            <p className="text-neutral-400 text-sm mb-6">{confirmationMessage}</p>
            <div className="bg-neutral-900/60 rounded-lg border border-neutral-700 p-4 text-left space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Date</span>
                <span className="text-sm text-white font-medium">{displayDate}</span>
              </div>
              <div className="border-t border-neutral-700/50" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Table</span>
                <span className="text-sm text-white font-medium">{bookedTable?.name || confirmedBooking.tableId || 'No table selected'}</span>
              </div>
              <div className="border-t border-neutral-700/50" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Game</span>
                <span className="text-sm text-white font-medium">{confirmedBooking.gameSystem}</span>
              </div>
              <div className="border-t border-neutral-700/50" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Players</span>
                <span className="text-sm text-white font-medium">{confirmedBooking.playerCount}</span>
              </div>
              {bookedTerrain && (<>
                <div className="border-t border-neutral-700/50" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-400 uppercase tracking-wider">Terrain</span>
                  <span className="text-sm text-white font-medium">{bookedTerrain.name}</span>
                </div>
              </>)}
              {confirmedBooking.secondaryTerrainId && (<>
                <div className="border-t border-neutral-700/50" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-400 uppercase tracking-wider">Extra Terrain</span>
                  <span className="text-sm text-white font-medium">{terrainBoxes.find(b => b.id === confirmedBooking.secondaryTerrainId)?.name || confirmedBooking.secondaryTerrainId}</span>
                </div>
              </>)}
              {tagged.length > 0 && (<>
                <div className="border-t border-neutral-700/50" />
                <div className="flex justify-between items-start">
                  <span className="text-xs text-neutral-400 uppercase tracking-wider pt-0.5">With</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {tagged.map((name, i) => (
                      <span key={i} className="text-xs bg-amber-900/30 border border-amber-700/50 text-amber-300 px-2 py-0.5 rounded-full">{name}</span>
                    ))}
                  </div>
                </div>
              </>)}
            </div>
            <button onClick={onClose} className="w-full px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all text-sm">Done</button>
          </div>
        </div>
      </div>
    );
  }

  const terrainCategories = Array.from(new Set(terrainBoxes.map(b => b.category)));
  const enabledTerrain = terrainBoxes.filter(b => !b.disabled && !b.allowAsSecondItem);
  const filteredTerrain = activeCategory === 'All'
    ? enabledTerrain
    : enabledTerrain.filter(b => b.category === activeCategory);

  const activeTerrainBookingsForDate = allBookings.filter(b => b.date === date && b.status === 'active' && b.id !== editingBooking?.id);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setSelectedTableId('');
    setSelectedTerrainId('');
    setSelectedSecondaryTerrainId('');
  }

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-2 md:p-4 overflow-y-auto">
      <div className="bg-neutral-800 rounded-xl shadow-2xl max-w-5xl xl:max-w-7xl w-full border border-neutral-700 overflow-hidden flex flex-col max-h-[calc(100vh-1rem)] md:max-h-[calc(100vh-2rem)] mx-auto mt-2 md:mt-8 xl:mt-12">
        <div className="p-6 border-b border-neutral-700 flex justify-between items-center bg-neutral-800 shrink-0">
            <h2 className="text-xl font-bold text-white">{editingBooking ? 'Edit Booking' : 'New Reservation'}</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="p-6 overflow-y-auto flex-grow">
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-4 space-y-4">
                        <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-700">
                            <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-3">1. Event Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Date</label>
                                    <select value={date} onChange={(e) => handleDateChange(e.target.value)} className="w-full bg-neutral-800 border border-neutral-600 rounded px-3 py-2 text-white focus:ring-1 focus:ring-amber-500 focus:outline-none text-sm">
                                        {bookableDates.map(d => ( <option key={d} value={d}>{new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Game System</label>
                                    <div className="mb-3">
                                      <Autocomplete
                                        value={gameSystem}
                                        onChange={setGameSystem}
                                        options={gameSystems}
                                        placeholder="e.g. Warhammer 40k"
                                        disabled={markedUnavailable}
                                      />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-neutral-400">Players:</span>
                                        <input type="number" min="0" max="10" value={playerCount} disabled={markedUnavailable} onChange={(e) => { setPlayerCount(parseInt(e.target.value)); setPlayerCountManuallySet(true); }} className="w-20 bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-white focus:ring-1 focus:ring-amber-500 focus:outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed" />
                                    </div>
                                    <div className="mt-3" ref={playerSearchRef}>
                                        <label className="block text-xs text-neutral-400 mb-1">Tag Players (Optional)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={playerSearchQuery}
                                                disabled={markedUnavailable}
                                                onChange={(e) => { if (markedUnavailable) return; setPlayerSearchQuery(e.target.value); setIsPlayerDropdownOpen(true); }}
                                                onFocus={() => { if (!markedUnavailable) setIsPlayerDropdownOpen(true); }}
                                                placeholder="Search users…"
                                                className="w-full bg-neutral-800 border border-neutral-600 rounded px-3 py-2 text-white focus:ring-1 focus:ring-amber-500 focus:outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                            {isPlayerDropdownOpen && (() => {
                                                const filtered = allUsers
                                                    .filter(u => u.id !== user.id)
                                                    .filter(u => !taggedPlayerIds.includes(u.id))
                                                    .filter(u => u.name.toLowerCase().includes(playerSearchQuery.toLowerCase()))
                                                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                                                return filtered.length > 0 ? (
                                                    <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl max-h-36 overflow-y-auto">
                                                        {filtered.map(u => (
                                                            <button key={u.id} type="button" onClick={() => { setTaggedPlayerIds(prev => { const next = [...prev, u.id]; if (!playerCountManuallySet) setPlayerCount(next.length + 1); return next; }); setPlayerSearchQuery(''); setIsPlayerDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors">
                                                                <span className="truncate">{u.name}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                        {taggedPlayerIds.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {taggedPlayerIds.map(id => {
                                                    const taggedUser = allUsers.find(u => u.id === id);
                                                    return (
                                                        <span key={id} className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-700/50 text-amber-300 text-xs px-2 py-1 rounded-full">
                                                            {taggedUser?.name || 'Unknown'}
                                                            <button type="button" disabled={markedUnavailable} onClick={() => setTaggedPlayerIds(prev => { const next = prev.filter(p => p !== id); if (!playerCountManuallySet) setPlayerCount(next.length + 1); return next; })} className="hover:text-white transition-colors disabled:cursor-not-allowed disabled:text-neutral-500">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    {user.isAdmin && (
                                      <div className="mt-4 rounded-lg border border-dashed border-amber-700/50 bg-amber-950/10 p-3" title="Use this to temporarily make a table unavailable for a specific night.">
                                        <label className="flex items-start gap-3 cursor-pointer text-sm text-neutral-200">
                                          <input
                                            type="checkbox"
                                            checked={markedUnavailable}
                                            onChange={(e) => {
                                              const next = e.target.checked;
                                              setMarkedUnavailable(next);
                                              const nextState = applyMarkedUnavailableToggle(
                                                {
                                                  gameSystem,
                                                  playerCount,
                                                  playerCountManuallySet,
                                                  taggedPlayerIds,
                                                },
                                                next
                                              );
                                              setGameSystem(nextState.gameSystem);
                                              setPlayerCount(nextState.playerCount);
                                              setPlayerCountManuallySet(nextState.playerCountManuallySet);
                                              setTaggedPlayerIds(nextState.taggedPlayerIds);
                                              if (next) {
                                                setPlayerSearchQuery('');
                                                setIsPlayerDropdownOpen(false);
                                              }
                                            }}
                                            className="mt-1 h-4 w-4 rounded border-neutral-500 bg-neutral-800 text-amber-600 focus:ring-amber-500"
                                          />
                                          <span>
                                            <span className="block font-medium text-white">Make Table Unavailable</span>
                                          </span>
                                        </label>
                                      </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="md:col-span-8">
                        <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-700 h-full">
                             <div className="flex justify-between items-center mb-3">
                                <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">2. Select Table</h3>
                                <button
                                    type="button"
                                    onClick={() => setShowLayoutModal(true)}
                                    className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-amber-400 border border-neutral-600 hover:border-amber-500/50 rounded px-2 py-1 transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                    Show Layout
                                </button>
                             </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 xl:gap-3 max-h-60 xl:max-h-72 overflow-y-auto pr-1">
                                {tables.map(table => {
                                    const takenBy = unavailableTables.get(table.id);
                                    const isTaken = !!takenBy;
                                    const isSelected = selectedTableId === table.id;
                                    return (
                                        <button key={table.id} disabled={isTaken} onClick={() => setSelectedTableId(table.id)} className={`p-2 rounded border text-left transition-all relative group ${isSelected ? 'bg-amber-600 border-amber-500 text-white ring-1 ring-amber-400' : ''} ${isTaken ? 'bg-neutral-800 border-neutral-700 opacity-60 cursor-not-allowed' : 'bg-neutral-800 border-neutral-600 hover:border-amber-500/50 hover:bg-neutral-700'}`}>
                                            <div className="font-bold text-sm">{table.name.replace('Table ', '')}</div>
                                            <div className="text-[10px] opacity-70">{table.size}</div>
                                            {isTaken && (
                                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded backdrop-blur-[1px]">
                                                    <div className="text-center">
                                                        <div className="text-[10px] text-neutral-400 leading-tight">Booked by</div>
                                                        <div className="text-[10px] text-red-400 font-semibold truncate px-1 max-w-[80px]">{takenBy}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                        <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">3. Select Terrain (Optional)</h3>
                        <div className="flex flex-wrap gap-2">
                            {['All', ...terrainCategories].map(cat => ( <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 border border-neutral-700'}`}>{cat}</button>))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 max-h-80 xl:max-h-[28rem] overflow-y-auto pr-2">
                        {activeCategory === 'All' && (<button onClick={() => { setSelectedTerrainId(''); setSelectedSecondaryTerrainId(''); }} className={`relative rounded-lg border-2 overflow-hidden h-36 xl:h-44 flex flex-col items-center justify-center transition-all group ${selectedTerrainId === '' && selectedSecondaryTerrainId === '' ? 'border-amber-500 bg-neutral-700 shadow-lg shadow-amber-900/20' : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700'}`}><span className="text-2xl mb-2 opacity-70 group-hover:opacity-100 transition-opacity">🚫</span><span className={`text-xs font-bold ${selectedTerrainId === '' && selectedSecondaryTerrainId === '' ? 'text-amber-500' : 'text-neutral-400'}`}>No Box Needed</span></button>)}
                        {secondItemTerrainBoxes.filter(box => activeCategory === 'All' || activeCategory === box.category).map(box => {
                            const status = getTerrainBoxStatus(box, activeTerrainBookingsForDate, user.id);
                            const isSelected = selectedSecondaryTerrainId === box.id;
                            const isDisabled = status.isFull && !isSelected;
                            return (
                                <button
                                    key={box.id}
                                    disabled={isDisabled}
                                    onClick={() => {
                                        setSelectedSecondaryTerrainId(isSelected ? '' : box.id);
                                    }}
                                    className={`relative rounded-lg border-2 overflow-hidden h-36 xl:h-44 text-left transition-all group ${isSelected ? 'border-amber-500 ring-2 ring-amber-500/50 transform scale-[1.02] z-10' : 'border-neutral-700 hover:border-neutral-500'} ${isDisabled ? 'opacity-75 cursor-not-allowed' : ''}`}
                                >
                                    <img src={box.uploadedImageUrl || box.imageUrl} alt={box.name} className="absolute inset-0 w-full h-full object-cover" />
                                    <div className={`absolute inset-0 bg-gradient-to-t ${isSelected ? 'from-amber-900/90' : 'from-black/90'} via-black/10 to-transparent`} />
                                    <div className="absolute bottom-0 left-0 p-3 w-full">
                                        <div className={`font-bold text-xs leading-tight ${isSelected ? 'text-amber-400' : 'text-white'}`}>{box.name}</div>
                                        <div className="text-[10px] text-neutral-400 uppercase tracking-wider mt-0.5">{box.category}</div>
                                        <div className={`text-[10px] mt-1 ${status.isCapacityLimited ? (status.isFull ? 'text-red-300' : status.isBookedByUser ? 'text-amber-300' : 'text-neutral-300') : 'text-green-400'}`}>
                                            {status.isCapacityLimited ? `${status.availableCount}/${status.capacity} available` : 'Add as extra item'}
                                        </div>
                                    </div>
                                    {isSelected && (<div className="absolute top-2 right-2 bg-amber-500 rounded-full p-1 shadow-lg"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>)}
                                    {isDisabled && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-2 text-center"><span className="text-red-500 text-[10px] font-bold border border-red-500/50 px-2 py-0.5 rounded bg-black/50 mb-1">IN USE</span><span className="text-neutral-300 text-[10px] font-medium truncate w-full">All sets booked</span></div>)}
                                </button>
                            );
                        })}
                        {filteredTerrain.map(box => {
                             const status = getTerrainBoxStatus(box, activeTerrainBookingsForDate, user.id);
                             const isSelected = selectedTerrainId === box.id;
                             const isTaken = status.isFull && !isSelected;
                             const takenBy = activeTerrainBookingsForDate.find(b => b.terrainBoxId === box.id || b.secondaryTerrainId === box.id)?.memberName;
                             return (
                                <button key={box.id} disabled={isTaken} onClick={() => setSelectedTerrainId(box.id)} className={`relative rounded-lg border-2 overflow-hidden h-36 xl:h-44 text-left transition-all group ${isSelected ? 'border-amber-500 ring-2 ring-amber-500/50 transform scale-[1.02] z-10' : 'border-neutral-700 hover:border-neutral-500'} ${isTaken ? 'opacity-75 cursor-not-allowed' : ''}`}>
                                    <img src={box.uploadedImageUrl || box.imageUrl} alt={box.name} className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isTaken ? 'grayscale' : ''}`} />
                                    <div className={`absolute inset-0 bg-gradient-to-t ${isSelected ? 'from-amber-900/90' : 'from-black/90'} via-black/10 to-transparent`} />
                                    <div className="absolute bottom-0 left-0 p-3 w-full">
                                        <div className={`font-bold text-xs leading-tight ${isSelected ? 'text-amber-400' : 'text-white'}`}>{box.name}</div>
                                        <div className="text-[10px] text-neutral-400 uppercase tracking-wider mt-0.5">{box.category}</div>
                                        {status.isCapacityLimited && (
                                          <div className={`text-[10px] mt-1 ${status.isFull ? 'text-red-300' : status.isBookedByUser ? 'text-amber-300' : 'text-neutral-300'}`}>
                                            {status.availableCount}/{status.capacity} available
                                          </div>
                                        )}
                                    </div>
                                    {isSelected && (<div className="absolute top-2 right-2 bg-amber-500 rounded-full p-1 shadow-lg"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>)}
                                    {isTaken && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-2 text-center"><span className="text-red-500 text-[10px] font-bold border border-red-500/50 px-2 py-0.5 rounded bg-black/50 mb-1">IN USE</span><span className="text-neutral-300 text-[10px] font-medium truncate w-full">{status.isCapacityLimited ? 'All sets booked' : takenBy}</span></div>)}
                                </button>
                             );
                        })}
                    </div>
                </div>
            </div>
        </div>
        {error && (
            <div className="px-6 py-3 bg-red-900/20 border-t border-red-900/50 flex items-center gap-3 shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-red-200 text-sm font-medium">{error}</span>
            </div>
        )}
        <div className="p-6 border-t border-neutral-700 bg-neutral-800 flex justify-end gap-3 z-20 shrink-0">
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors font-medium text-sm">Cancel</button>
            <button
              onClick={handleSave}
              disabled={
                cancelledDates.includes(date)
                || !selectedTableId
                || (!markedUnavailable && !gameSystem)
              }
              className="px-8 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:from-neutral-700 disabled:to-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all hover:translate-y-px text-sm"
            >
              Confirm Booking
            </button>
        </div>
      </div>
    </div>
    {showLayoutModal && (
        <div
            className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Club table layout"
            onClick={() => setShowLayoutModal(false)}
        >
            <div
                className="bg-neutral-800 rounded-xl shadow-2xl max-w-3xl w-full border border-neutral-700 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Club Table Layout</h3>
                    <button onClick={() => setShowLayoutModal(false)} className="text-neutral-400 hover:text-white transition-colors" aria-label="Close">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-4 max-h-[80vh] overflow-y-auto">
                    <img
                        src={`${import.meta.env.BASE_URL}images/club-layout-lite.jpg`}
                        alt="Club table layout"
                        className="w-full h-auto rounded-lg border border-neutral-700"
                    />
                </div>
            </div>
        </div>
    )}
    </>
  );
};
