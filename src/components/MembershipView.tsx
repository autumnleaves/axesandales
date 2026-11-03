import React from 'react';

export const MembershipView: React.FC = () => {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="bg-neutral-800 rounded-xl p-8 border border-neutral-700 shadow-xl text-center">
        <h1 className="text-3xl font-bold text-amber-500 mb-2">Membership &amp; Payment</h1>
        <p className="text-neutral-400 text-sm">Northern Suburbs Gamers Club Incorporated</p>
      </div>

      {/* Free to Play */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          Membership Is Optional
        </h2>
        <p className="text-neutral-300 leading-relaxed">
          Axes & Ales is <span className="text-white font-medium">free to attend</span>. You're welcome to come down any Tuesday night, grab a seat, and join in a game — no membership needed and no entry fee. We want everyone to feel welcome, whether it's your first visit or your fiftieth.
        </p>
        <p className="text-neutral-300 leading-relaxed">
          As a not-for-profit club, memberships simply help us cover venue hire, terrain, and running costs. In return, members can <span className="text-white font-medium">book tables in advance</span> through this site, so you can lock in your game for the night. But if you'd rather just turn up and play, that's completely fine too.
        </p>
      </div>

      {/* Membership Info */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          Annual Membership
        </h2>
        <p className="text-neutral-300 leading-relaxed">
          Memberships are valid for <span className="text-white font-medium">12 months</span> from the date your payment is confirmed.
        </p>
        <div className="bg-neutral-900/50 rounded-lg p-4 border border-neutral-700 flex items-center justify-between">
          <span className="text-neutral-300">Regular Annual Membership</span>
          <span className="text-amber-400 text-xl font-bold">$60</span>
        </div>
      </div>

      {/* How to Join */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          How to Join / Renew
        </h2>
        <ol className="list-decimal list-inside space-y-3 text-neutral-300">
          <li>
            <span className="font-medium text-white">Create an account</span> on this site using the <span className="text-amber-400 font-medium">Sign In</span> button above. Make note of the email address you use.
          </li>
          <li>
            <span className="font-medium text-white">Make your payment</span> using the PayPal button below. When paying, <span className="text-amber-400 font-medium">include the email address you signed up with</span> so we can match your payment to your account.
          </li>
          <li>
            <span className="font-medium text-white">Allow up to 24 hours</span> for your membership to be applied to your account. If it still hasn't been applied after that, email the committee at{' '}
            <a href="mailto:axesandalescommittee@gmail.com" className="text-amber-400 hover:text-amber-300 underline font-medium">axesandalescommittee@gmail.com</a>{' '}
            and we'll sort it out.
          </li>
        </ol>
      </div>

      {/* Payment */}
      <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-8 bg-amber-600 rounded-full inline-block"></span>
          Pay via PayPal
        </h2>
        <p className="text-neutral-400 text-sm">
          You do <span className="text-white font-medium">NOT</span> need a PayPal account — you can choose to pay with a credit or debit card instead.
        </p>
        <p className="text-neutral-400 text-sm">
          We would appreciate you paying as Friends &amp; Family, as it saves the club from fees.
        </p>
        <div className="flex justify-center">
          <a
            href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TZDSJZUZDTPSG"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.603c-.564 0-1.04.408-1.13.964L7.076 21.337z"/></svg>
            Pay Now with PayPal
          </a>
        </div>
        <p className="text-neutral-500 text-sm text-center mt-2">
          If you pay using an email address that doesn't match the one you signed up with, please{' '}
          <a href="mailto:axesandalescommittee@gmail.com" className="text-amber-400 hover:text-amber-300 underline">contact the committee</a> so we can link your payment.
        </p>
      </div>
    </div>
  );
};
