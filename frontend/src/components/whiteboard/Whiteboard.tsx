import React, { useEffect, useState, useCallback } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { CollaborationProvider } from '../../lib/collaboration/YjsProvider';
import { Toolbar } from './Toolbar';
import { CanvasManager } from '../../lib/whiteboard/CanvasManager';
import { SyncManager } from '../../lib/whiteboard/SyncManager';

interface WhiteboardProps {
  roomId: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ roomId }) => {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [canvasManager, setCanvasManager] = useState<CanvasManager | null>(null);
  const [syncManager, setSyncManager] = useState<SyncManager | null>(null);
  const [provider] = useState(() => new CollaborationProvider(`whiteboard-${roomId}`));

  useEffect(() => {
    return () => {
      provider.destroy();
    };
  }, [provider]);

  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor);
    const cm = new CanvasManager(editor);
    const sm = new SyncManager(provider.doc, editor);
    setCanvasManager(cm);
    setSyncManager(sm);
    sm.syncWithYjs();
  }, [provider.doc]);

  const handleAddShape = (type: string) => {
    if (!canvasManager) return;
    
    if (type === 'contract') canvasManager.addSorobanContract(400, 300);
    else if (type === 'account') canvasManager.addStellarAccount(400, 300);
    else if (type === 'asset') canvasManager.addAsset(400, 300);
    else if (type === 'anchor') canvasManager.addAnchor(400, 300);
    else if (type === 'multisig') canvasManager.addMultisig(400, 300);
    else if (type === 'oracle') canvasManager.addOracle(400, 300);
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] relative overflow-hidden">
      <Toolbar 
        onAddShape={handleAddShape} 
        onExport={() => canvasManager?.exportAsPNG()} 
      />

      <div className="flex-grow w-full h-full tldraw-dark">
        <Tldraw 
          inferDarkMode 
          onMount={handleMount}
          persistenceKey={`whiteboard-${roomId}`}
          className="w-full h-full"
        />
      </div>
    </div>
  );
};
