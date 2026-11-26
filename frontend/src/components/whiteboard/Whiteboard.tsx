import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const [canvasManager, setCanvasManager] = useState<CanvasManager | null>(null);
  const syncManagerRef = useRef<SyncManager | null>(null);
  const [provider] = useState(() => new CollaborationProvider(`whiteboard-${roomId}`));

  useEffect(() => {
    return () => {
      syncManagerRef.current?.destroy();
      provider.destroy();
    };
  }, [provider]);

  const handleMount = useCallback(
    (editor: Editor) => {
      const cm = new CanvasManager(editor);
      const sm = new SyncManager(provider.doc, editor, provider.awareness);
      setCanvasManager(cm);
      syncManagerRef.current?.destroy();
      syncManagerRef.current = sm;
      sm.syncWithYjs();
    },
    [provider.doc, provider.awareness]
  );

  const handleAddShape = (type: string) => {
    if (!canvasManager) return;

    if (type === 'contract') canvasManager.addSorobanContract(400, 300);
    else if (type === 'account') canvasManager.addStellarAccount(400, 300);
    else if (type === 'asset') canvasManager.addAsset(400, 300);
    else if (type === 'anchor') canvasManager.addAnchor(400, 300);
    else if (type === 'multisig') canvasManager.addMultisig(400, 300);
    else if (type === 'oracle') canvasManager.addOracle(400, 300);
    else if (type === 'sticky') canvasManager.addStickyNote(400, 300);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#09090b]">
      <Toolbar
        onAddShape={handleAddShape}
        onExport={() => {
          void canvasManager?.exportAsPNG({ filename: `whiteboard-${roomId}.png`, scale: 2 });
        }}
        onExportSVG={() => {
          void canvasManager?.exportAsSVG(
            { filename: `whiteboard-${roomId}.svg` },
            syncManagerRef.current?.getAllShapes() ?? []
          );
        }}
        onExportJSON={() => {
          canvasManager?.exportAsJSON(
            { filename: `whiteboard-${roomId}.json` },
            syncManagerRef.current?.getAllShapes() ?? []
          );
        }}
      />

      <div className="tldraw-dark h-full w-full flex-grow">
        <Tldraw
          inferDarkMode
          onMount={handleMount}
          persistenceKey={`whiteboard-${roomId}`}
          className="h-full w-full"
        />
      </div>
    </div>
  );
};
