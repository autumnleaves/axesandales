import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GalleryAward, GalleryEntry, GalleryEvent, GalleryIndex } from '../types';
import {
  GALLERY_AWARDS,
  GALLERY_AWARD_LABELS,
  countGalleryAwards,
  filterGalleryEntries,
  galleryAssetUrl,
  type GalleryAwardFilter,
} from '../utils/galleryHelpers';

const AWARD_BADGE_STYLES: Record<GalleryAward, string> = {
  gold: 'bg-amber-400 text-black',
  silver: 'bg-neutral-300 text-neutral-900',
  bronze: 'bg-orange-700 text-orange-50',
  commended: 'bg-sky-900/70 border border-sky-700 text-sky-200',
};

const AWARD_DOT_STYLES: Record<GalleryAward, string> = {
  gold: 'bg-amber-400',
  silver: 'bg-neutral-300',
  bronze: 'bg-orange-600',
  commended: 'bg-sky-500',
};

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(galleryAssetUrl(path));
  if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
  return response.json() as Promise<T>;
};

const AwardBadges: React.FC<{ entry: GalleryEntry }> = ({ entry }) => (
  <div className="flex flex-wrap gap-1.5">
    {entry.award && (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${AWARD_BADGE_STYLES[entry.award]}`}>
        {GALLERY_AWARD_LABELS[entry.award]}
      </span>
    )}
    {entry.specialAwards.map(award => (
      <span key={award} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-red-500 text-black">
        ★ {award}
      </span>
    ))}
  </div>
);

interface LightboxProps {
  entries: GalleryEntry[];
  index: number;
  eventTitle: string;
  onChange: (index: number) => void;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ entries, index, eventTitle, onChange, onClose }) => {
  const entry = entries[index];
  const hasMultiple = entries.length > 1;
  const showPrevious = useCallback(() => onChange((index - 1 + entries.length) % entries.length), [entries.length, index, onChange]);
  const showNext = useCallback(() => onChange((index + 1) % entries.length), [entries.length, index, onChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && hasMultiple) showPrevious();
      else if (event.key === 'ArrowRight' && hasMultiple) showNext();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [hasMultiple, onClose, showNext, showPrevious]);

  const navButton = 'absolute top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-neutral-900/80 text-neutral-200 hover:bg-neutral-800 hover:text-white';

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name}'s entry`}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-2 rounded-full bg-neutral-900/80 text-neutral-200 hover:bg-neutral-800 hover:text-white"
        aria-label="Close"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {hasMultiple && (
        <button onClick={e => { e.stopPropagation(); showPrevious(); }} className={`${navButton} left-2 sm:left-4`} aria-label="Previous entry">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <figure className="flex flex-col items-center gap-3 max-h-full" onClick={e => e.stopPropagation()}>
        <img
          key={entry.id}
          src={galleryAssetUrl(entry.image.src)}
          width={entry.image.width}
          height={entry.image.height}
          alt={`Painted miniature by ${entry.name}`}
          className="max-h-[80vh] w-auto h-auto max-w-full rounded-lg object-contain"
        />
        <figcaption className="flex flex-wrap items-center justify-center gap-3 text-center">
          <span className="text-white font-semibold text-lg">{entry.name}</span>
          <AwardBadges entry={entry} />
          <span className="text-neutral-500 text-sm">
            {eventTitle} · {index + 1} of {entries.length}
          </span>
        </figcaption>
      </figure>

      {hasMultiple && (
        <button onClick={e => { e.stopPropagation(); showNext(); }} className={`${navButton} right-2 sm:right-4`} aria-label="Next entry">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
};

export const GalleryView: React.FC = () => {
  const [index, setIndex] = useState<GalleryIndex | null>(null);
  const [eventsById, setEventsById] = useState<Record<string, GalleryEvent>>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [awardFilter, setAwardFilter] = useState<GalleryAwardFilter>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<GalleryIndex>('gallery/index.json')
      .then(loaded => {
        if (cancelled) return;
        setIndex(loaded);
        setSelectedEventId(current => current ?? loaded.events[0]?.id ?? null);
      })
      .catch(err => !cancelled && setError((err as Error).message));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedEventId || eventsById[selectedEventId]) return;
    let cancelled = false;
    fetchJson<GalleryEvent>(`gallery/${selectedEventId}/event.json`)
      .then(loaded => !cancelled && setEventsById(prev => ({ ...prev, [loaded.id]: loaded })))
      .catch(err => !cancelled && setError((err as Error).message));
    return () => { cancelled = true; };
  }, [eventsById, selectedEventId]);

  const selectedEvent = selectedEventId ? eventsById[selectedEventId] : undefined;
  const counts = useMemo(() => countGalleryAwards(selectedEvent?.entries ?? []), [selectedEvent]);
  const visibleEntries = useMemo(
    () => filterGalleryEntries(selectedEvent?.entries ?? [], awardFilter),
    [awardFilter, selectedEvent],
  );

  const selectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setAwardFilter('all');
    setLightboxIndex(null);
  };
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const filterOptions: GalleryAwardFilter[] = ['all', ...GALLERY_AWARDS];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
        Painting Gallery
      </h1>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-200 text-sm">
          Couldn't load the gallery: {error}
        </div>
      )}

      {!error && !index && <p className="text-neutral-400">Loading gallery...</p>}

      {index && index.events.length === 0 && (
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 text-center text-neutral-400">
          No events in the gallery yet.
        </div>
      )}

      {index && index.events.length > 0 && (
        <>
          {/* Event tabs */}
          <div className="overflow-x-auto shadow-[inset_0_-1px_0_theme(colors.neutral.700)]">
            <div role="tablist" aria-label="Events" className="flex gap-1 min-w-max">
              {index.events.map(event => {
                const isActive = event.id === selectedEventId;
                return (
                  <button
                    key={event.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => selectEvent(event.id)}
                    className={`px-4 py-2.5 border-b-2 font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-amber-500 text-amber-300'
                        : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-500'
                    }`}
                  >
                    {event.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Award filter */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by award">
            {filterOptions.map(option => {
              const isSelected = awardFilter === option;
              const count = counts[option];
              return (
                <button
                  key={option}
                  onClick={() => setAwardFilter(option)}
                  disabled={!selectedEvent || (count === 0 && !isSelected)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-amber-900/50 border-amber-700 text-amber-300'
                      : 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  {option !== 'all' && <span className={`w-2.5 h-2.5 rounded-full ${AWARD_DOT_STYLES[option]}`} />}
                  {option === 'all' ? 'All' : GALLERY_AWARD_LABELS[option]}
                  <span className="text-xs text-neutral-500">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Entries */}
          {!selectedEvent && !error && <p className="text-neutral-400">Loading entries...</p>}

          {selectedEvent && visibleEntries.length === 0 && (
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-8 text-center text-neutral-400">
              No entries match this filter.
            </div>
          )}

          {selectedEvent && visibleEntries.length > 0 && (
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleEntries.map((entry, entryIndex) => (
                <li key={entry.id} className="flex">
                  <button
                    onClick={() => setLightboxIndex(entryIndex)}
                    className="group w-full flex flex-col text-left bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden hover:border-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition-colors"
                  >
                    <div className="overflow-hidden bg-neutral-950" style={{ aspectRatio: `${entry.thumbnail.width} / ${entry.thumbnail.height}` }}>
                      <img
                        src={galleryAssetUrl(entry.thumbnail.src)}
                        width={entry.thumbnail.width}
                        height={entry.thumbnail.height}
                        alt={`Painted miniature by ${entry.name}`}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="text-white font-semibold">{entry.name}</div>
                      <AwardBadges entry={entry} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selectedEvent && lightboxIndex !== null && visibleEntries[lightboxIndex] && (
        <Lightbox
          entries={visibleEntries}
          index={lightboxIndex}
          eventTitle={selectedEvent.title}
          onChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
};
