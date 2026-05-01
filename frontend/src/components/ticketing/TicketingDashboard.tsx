"use client";

import React, { useState } from 'react';
import { Ticket, Search, ShieldCheck, Tag, ShoppingCart, User, QrCode } from 'lucide-react';

export default function TicketingDashboard() {
  const [activeTab, setActiveTab] = useState<'browse' | 'wallet' | 'marketplace'>('browse');

  const events = [
    { id: 1, name: 'Web3 Global Summit', date: '2026-05-10', venue: 'Crypto Arena', price: 100, available: 500 },
    { id: 2, name: 'Rust Developer Conference', date: '2026-06-15', venue: 'Tech Center', price: 150, available: 200 },
  ];

  const myTickets = [
    { id: 101, eventName: 'Web3 Global Summit', date: '2026-05-10', seat: 'Section A, Row 5', qr: 'hash_123', faceValue: 100 },
  ];

  const resaleListings = [
    { id: 201, eventName: 'Rust Developer Conference', seller: '0x123...abc', originalPrice: 150, askingPrice: 165 }, // Max 10% markup
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-blue-900 flex items-center gap-2">
              <Ticket className="w-10 h-10 text-blue-600" />
              SecureTix
            </h1>
            <p className="text-gray-500 mt-2">Anti-Scalping NFT Ticketing Platform</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full flex items-center gap-2 font-medium">
              <ShieldCheck className="w-5 h-5" />
              Identity Verified
            </div>
          </div>
        </header>

        <nav className="flex gap-4 mb-8 border-b pb-4">
          <button 
            onClick={() => setActiveTab('browse')}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors ${activeTab === 'browse' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <Search className="w-5 h-5" /> Browse Events
          </button>
          <button 
            onClick={() => setActiveTab('wallet')}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors ${activeTab === 'wallet' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <User className="w-5 h-5" /> My Tickets
          </button>
          <button 
            onClick={() => setActiveTab('marketplace')}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors ${activeTab === 'marketplace' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            <Tag className="w-5 h-5" /> Resale Marketplace
          </button>
        </nav>

        <main>
          {activeTab === 'browse' && (
            <div className="grid md:grid-cols-2 gap-6">
              {events.map(event => (
                <div key={event.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-shadow">
                  <h3 className="text-2xl font-bold mb-2">{event.name}</h3>
                  <div className="text-gray-600 space-y-1 mb-4">
                    <p>📅 {event.date}</p>
                    <p>📍 {event.venue}</p>
                    <p>🎟️ {event.available} tickets left</p>
                  </div>
                  <div className="flex justify-between items-center border-t pt-4">
                    <span className="text-xl font-bold text-blue-600">${event.price}</span>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" /> Buy Ticket
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="grid md:grid-cols-2 gap-6">
              {myTickets.map(ticket => (
                <div key={ticket.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex transition-transform hover:-translate-y-1">
                  <div className="bg-blue-600 w-4 flex-shrink-0"></div>
                  <div className="p-6 w-full flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold mb-1">{ticket.eventName}</h3>
                      <p className="text-gray-500 text-sm mb-4">📅 {ticket.date} | {ticket.seat}</p>
                      <button className="text-blue-600 text-sm font-semibold hover:underline">List for Resale</button>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="bg-gray-100 p-3 rounded-lg border border-gray-200">
                        <QrCode className="w-16 h-16 text-gray-800" />
                      </div>
                      <span className="text-xs text-gray-400 font-mono">#{ticket.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'marketplace' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Authorized Resale Marketplace</h2>
                  <p className="text-sm text-gray-500 mt-1">Prices are capped at 15% above face value to prevent scalping. Organizers automatically receive a 5% royalty.</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {resaleListings.map(listing => (
                  <div key={listing.id} className="p-6 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{listing.eventName}</h3>
                      <p className="text-sm text-gray-500">Seller: {listing.seller}</p>
                      <p className="text-sm text-gray-500">Original Face Value: ${listing.originalPrice}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600 mb-2">${listing.askingPrice}</p>
                      <button className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-2 rounded-lg font-medium text-sm shadow-sm">
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
