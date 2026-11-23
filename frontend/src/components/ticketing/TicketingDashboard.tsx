'use client';

import React, { useState } from 'react';
import { Ticket, Search, ShieldCheck, Tag, ShoppingCart, User, QrCode } from 'lucide-react';

export default function TicketingDashboard() {
  const [activeTab, setActiveTab] = useState<'browse' | 'wallet' | 'marketplace'>('browse');

  const events = [
    {
      id: 1,
      name: 'Web3 Global Summit',
      date: '2026-05-10',
      venue: 'Crypto Arena',
      price: 100,
      available: 500,
    },
    {
      id: 2,
      name: 'Rust Developer Conference',
      date: '2026-06-15',
      venue: 'Tech Center',
      price: 150,
      available: 200,
    },
  ];

  const myTickets = [
    {
      id: 101,
      eventName: 'Web3 Global Summit',
      date: '2026-05-10',
      seat: 'Section A, Row 5',
      qr: 'hash_123',
      faceValue: 100,
    },
  ];

  const resaleListings = [
    {
      id: 201,
      eventName: 'Rust Developer Conference',
      seller: '0x123...abc',
      originalPrice: 150,
      askingPrice: 165,
    }, // Max 10% markup
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-4xl font-extrabold text-blue-900">
              <Ticket className="h-10 w-10 text-blue-600" />
              SecureTix
            </h1>
            <p className="mt-2 text-gray-500">Anti-Scalping NFT Ticketing Platform</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 font-medium text-green-800">
              <ShieldCheck className="h-5 w-5" />
              Identity Verified
            </div>
          </div>
        </header>

        <nav className="mb-8 flex gap-4 border-b pb-4">
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-colors ${activeTab === 'browse' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <Search className="h-5 w-5" /> Browse Events
          </button>
          <button
            onClick={() => setActiveTab('wallet')}
            className={`flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-colors ${activeTab === 'wallet' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <User className="h-5 w-5" /> My Tickets
          </button>
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-colors ${activeTab === 'marketplace' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <Tag className="h-5 w-5" /> Resale Marketplace
          </button>
        </nav>

        <main>
          {activeTab === 'browse' && (
            <div className="grid gap-6 md:grid-cols-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg"
                >
                  <h3 className="mb-2 text-2xl font-bold">{event.name}</h3>
                  <div className="mb-4 space-y-1 text-gray-600">
                    <p>📅 {event.date}</p>
                    <p>📍 {event.venue}</p>
                    <p>🎟️ {event.available} tickets left</p>
                  </div>
                  <div className="flex items-center justify-between border-t pt-4">
                    <span className="text-xl font-bold text-blue-600">${event.price}</span>
                    <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
                      <ShoppingCart className="h-4 w-4" /> Buy Ticket
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="grid gap-6 md:grid-cols-2">
              {myTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-transform hover:-translate-y-1"
                >
                  <div className="w-4 flex-shrink-0 bg-blue-600"></div>
                  <div className="flex w-full items-center justify-between p-6">
                    <div>
                      <h3 className="mb-1 text-xl font-bold">{ticket.eventName}</h3>
                      <p className="mb-4 text-sm text-gray-500">
                        📅 {ticket.date} | {ticket.seat}
                      </p>
                      <button className="text-sm font-semibold text-blue-600 hover:underline">
                        List for Resale
                      </button>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="rounded-lg border border-gray-200 bg-gray-100 p-3">
                        <QrCode className="h-16 w-16 text-gray-800" />
                      </div>
                      <span className="font-mono text-xs text-gray-400">#{ticket.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'marketplace' && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Authorized Resale Marketplace</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Prices are capped at 15% above face value to prevent scalping. Organizers
                    automatically receive a 5% royalty.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {resaleListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between p-6 transition-colors hover:bg-gray-50"
                  >
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{listing.eventName}</h3>
                      <p className="text-sm text-gray-500">Seller: {listing.seller}</p>
                      <p className="text-sm text-gray-500">
                        Original Face Value: ${listing.originalPrice}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="mb-2 text-2xl font-bold text-blue-600">
                        ${listing.askingPrice}
                      </p>
                      <button className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800">
                        Purchase & Transfer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
