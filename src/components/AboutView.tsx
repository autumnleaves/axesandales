import React from 'react';
import { DISCORD_INVITE_URL } from '../constants';
import { LocationView } from './LocationView';

export const AboutView: React.FC = () => {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="bg-neutral-800 rounded-xl p-8 border border-neutral-700 shadow-xl text-center">
        <h1 className="text-3xl font-bold text-amber-500 mb-2">Axes & Ales Gaming Club</h1>
        <p className="text-neutral-400 text-sm">Northern Suburbs Gamers Club Incorporated</p>
      </div>

      {/* Community image */}
      <div className="rounded-xl overflow-hidden border border-neutral-700 shadow-xl">
        <img
          src={`${import.meta.env.BASE_URL}images/aa-community.jpg`}
          alt="Axes & Ales community"
          className="w-full h-auto object-cover"
        />
      </div>

      {/* About */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          About the Club
        </h2>
        <p className="text-neutral-300 leading-relaxed">
          Axes & Ales Gaming Club is a tabletop club based in Melbourne. We meet every Tuesday night at <a href="https://www.google.com/maps?q=27+Ballantyne+St,+Thornbury+VIC+3071" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">Thornbury Bowls Club</a> and
          play all types of tabletop games from miniature wargames to board games to roleplaying games plus much more.
        </p>
        <p className="text-neutral-300 leading-relaxed">
          We are a social club first. Our main goal is to provide a safe, friendly and inclusive environment. We're all about rolling dice, telling stories, and enjoying the hobby that we all love. 
        </p>
        <p className="text-neutral-300 leading-relaxed">
          The club has a massive collection of tables and terrain for a wide range of games and settings, as well as a dedicated painting table that anyone is welcome use on the night!
        </p>
        <p className="text-neutral-300 leading-relaxed">
          So whether you’re here for a narrative campaign or practicing for the next tournament, Axes & Ales is a welcoming space to unwind, grab a drink, and play.
        </p>
      </div>

      {/* Inclusivity */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          We're Inclusive and Welcoming
        </h2>
        <p className="text-neutral-300 leading-relaxed">
          Axes & Ales welcomes all gamers, and we strive to create a safe and inclusive environment.
        </p>
        <p className="text-neutral-300 leading-relaxed">
          The club is a place for everyone to enjoy the hobby, 
          regardless of race, gender, sexuality, or neurotype, 
          and we are a place for both experienced players and those who are just starting out.           
        </p>
      </div>

      {/* Co-ordinate a Game */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          Want to Co-ordinate a Game?
        </h2>
        <p className="text-neutral-300 leading-relaxed">
          Discord is our primary platform for organising games — post what you want to play, find opponents, and lock in your Tuesday night plans. You can also arrange games through our Facebook group if that's more your style.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
            </svg>
            Join our Discord
          </a>
          <a
            href="https://www.facebook.com/groups/591553861000353"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#1877F2] hover:bg-[#1464CC] text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook Group
          </a>
        </div>
      </div>

      <LocationView />

      {/* Terrain image */}
      <div className="rounded-xl overflow-hidden border border-neutral-700 shadow-xl">
        <img
          src={`${import.meta.env.BASE_URL}images/aa-quality-terrain.jpg`}
          alt="Quality terrain at Axes & Ales"
          className="w-full h-auto object-cover"
        />
      </div>

      {/* Our Community */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          Our Community
        </h2>
        <p className="text-neutral-300 leading-relaxed">
          Axes & Ales is a <span className="text-white font-medium">registered not-for-profit incorporated association</span> — the Northern Suburbs Gamers Club Inc. We're run entirely by volunteers and nobody makes a cent from the club.
        </p>
        <p className="text-neutral-300 leading-relaxed">
          Every dollar that comes in goes straight back into the club — whether that's new terrain, gaming mats, venue costs, or community events. Our volunteer committee keeps things running in their spare time purely for the love of the hobby.
        </p>
        <p className="text-neutral-300 leading-relaxed">
          <span className="text-white font-medium">Everyone is welcome to come along and play for free</span> — no membership required, no pressure. Just turn up on a Tuesday night and join in. Memberships exist simply to help cover our running costs, maintain our terrain and tables, and to help support running events.
        </p>
        <p className="text-neutral-300 leading-relaxed">
          Members get the perk of being able to book tables in advance. But if you just want to turn up and play, that's completely fine too! If you're new, our committee and regulars are always happy to have a chat, introduce you to the club, and help you find a game.
        </p>
      </div>      
      {/* The Committee */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          The Committee
        </h2>
        <p className="text-neutral-400 text-sm">
          Need to reach the committee? Jump on{' '}
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">Discord</a>,
          message us on{' '}
          <a href="https://www.facebook.com/groups/axesandales" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">Facebook</a>,
          or email{' '}
          <a href="mailto:axesandalescommittee@gmail.com" className="text-amber-400 hover:text-amber-300 underline">axesandalescommittee@gmail.com</a>.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
          {[
            { name: 'Tom', role: 'President' },
            { name: 'Glyn', role: 'Vice President' },
            { name: 'Jason/Dutch Law', role: 'Treasurer' },
            { name: 'Tyrone', role: 'Secretary' },
            { name: 'Daniel', role: 'Club Photographer' },
            { name: 'Jason/GCUGreyArea', role: 'General Committee' },
            { name: 'Stew', role: 'General Committee' },
            { name: 'Rob/Fodzilla', role: 'General Committee' },
            { name: 'Rob D', role: 'General Committee' },
            { name: 'Enrique/Soulstress', role: 'General Committee' },
            { name: 'Adam', role: 'General Committee' },
            { name: "Tim", role: "General Committee" },
            
          ].map((member) => (
            <div key={member.name} className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-700 text-center">
              <div className="w-10 h-10 rounded-full bg-amber-600/20 border border-amber-700/50 flex items-center justify-center mx-auto mb-2 text-amber-400 font-bold text-sm">
                {member.name.split(' ').map(n => n[0]).join('')}
              </div>
              <p className="text-white text-sm font-medium">{member.name}</p>
              <p className="text-neutral-500 text-xs">{member.role}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
