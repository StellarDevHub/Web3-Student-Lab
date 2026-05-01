import React, { useState, useEffect } from 'react';
import './AssetMarketplace.css';

// Types
export type RarityTier = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export interface Asset {
  id: string;
  name: string;
  gameId: string;
  imageUri: string;
  price: number;
  rarityTier: RarityTier;
  seller: string;
  attributes: Record<string, string>;
}

const mockAssets: Asset[] = [
  {
    id: '1',
    name: 'Sword of a Thousand Truths',
    gameId: 'WoW',
    imageUri: 'https://images.unsplash.com/photo-1595590424283-b8f1784cb2c8?w=500&q=80',
    price: 500,
    rarityTier: 'Legendary',
    seller: '0x123...abc',
    attributes: { damage: '120', speed: 'fast' },
  },
  {
    id: '2',
    name: 'Elven Bow',
    gameId: 'Skyrim',
    imageUri: 'https://images.unsplash.com/photo-1590483863414-b610738d2f09?w=500&q=80',
    price: 150,
    rarityTier: 'Epic',
    seller: '0x456...def',
    attributes: { range: 'long', drawSpeed: 'medium' },
  },
  {
    id: '3',
    name: 'Iron Shield',
    gameId: 'DarkSouls',
    imageUri: 'https://images.unsplash.com/photo-1589309736404-2e142a2acdf0?w=500&q=80',
    price: 50,
    rarityTier: 'Rare',
    seller: '0x789...ghi',
    attributes: { defense: '50', weight: 'heavy' },
  },
  {
    id: '4',
    name: 'Health Potion',
    gameId: 'GenericRPG',
    imageUri: 'https://images.unsplash.com/photo-1629858348843-f62f83526131?w=500&q=80',
    price: 10,
    rarityTier: 'Common',
    seller: '0xabc...123',
    attributes: { healing: '50hp' },
  },
];

export const AssetMarketplace: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('All');

  useEffect(() => {
    // Mock fetching assets
    setTimeout(() => {
      setAssets(mockAssets);
      setLoading(false);
    }, 1000);
  }, []);

  const handleBuy = (id: string) => {
    console.log(`Buying asset ${id}`);
    alert(`Initiated purchase for asset ${id}`);
  };

  const getRarityClass = (tier: RarityTier) => {
    return `rarity-${tier.toLowerCase()}`;
  };

  const filteredAssets = filter === 'All' 
    ? assets 
    : assets.filter(a => a.rarityTier === filter);

  return (
    <div className="marketplace-container">
      <header className="marketplace-header">
        <h1 className="marketplace-title">Cross-Game Asset Exchange</h1>
        <p className="marketplace-subtitle">Trade verified gaming NFTs across the multiverse</p>
      </header>

      <div className="marketplace-controls">
        <div className="filter-group">
          {['All', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'].map((f) => (
            <button 
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="list-asset-btn">List New Asset</button>
      </div>

      {loading ? (
        <div className="loading-spinner"></div>
      ) : (
        <div className="asset-grid">
          {filteredAssets.map((asset) => (
            <div key={asset.id} className={`asset-card ${getRarityClass(asset.rarityTier)}`}>
              <div className="asset-image-container">
                <img src={asset.imageUri} alt={asset.name} className="asset-image" />
                <div className={`rarity-badge ${getRarityClass(asset.rarityTier)}`}>
                  {asset.rarityTier}
                </div>
              </div>
              
              <div className="asset-details">
                <h3 className="asset-name">{asset.name}</h3>
                <span className="game-id-badge">{asset.gameId}</span>
                
                <div className="asset-attributes">
                  {Object.entries(asset.attributes).map(([key, val]) => (
                    <div key={key} className="attribute-tag">
                      <span className="attr-key">{key}:</span> {val}
                    </div>
                  ))}
                </div>

                <div className="asset-footer">
                  <div className="price-tag">
                    <span className="price-amount">{asset.price}</span>
                    <span className="price-currency">XLM</span>
                  </div>
                  <button className="buy-btn" onClick={() => handleBuy(asset.id)}>
                    Buy Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
