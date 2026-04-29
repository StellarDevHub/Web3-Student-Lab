import { Editor, TLShapeId } from 'tldraw';

export class CanvasManager {
  constructor(private editor: Editor) {}

  public addStellarAccount(x: number, y: number) {
    this.editor.createShapes([{
      id: this.editor.generateShapeId(),
      type: 'geo',
      x,
      y,
      props: {
        geo: 'ellipse',
        w: 180,
        h: 180,
        text: 'Stellar Account',
        color: 'orange',
        fill: 'semi',
      },
    }]);
  }

  public addSorobanContract(x: number, y: number) {
    this.editor.createShapes([{
      id: this.editor.generateShapeId(),
      type: 'geo',
      x,
      y,
      props: {
        geo: 'rectangle',
        w: 240,
        h: 160,
        text: 'Soroban Contract',
        color: 'blue',
        fill: 'semi',
      },
    }]);
  }

  public addAsset(x: number, y: number) {
    this.editor.createShapes([{
      id: this.editor.generateShapeId(),
      type: 'geo',
      x,
      y,
      props: {
        geo: 'diamond',
        w: 180,
        h: 180,
        text: 'Asset',
        color: 'green',
        fill: 'semi',
      },
    }]);
  }

  public addAnchor(x: number, y: number) {
    this.editor.createShapes([{
      id: this.editor.generateShapeId(),
      type: 'geo',
      x,
      y,
      props: {
        geo: 'rectangle',
        w: 260,
        h: 180,
        text: 'Anchor (Fiat Bridge)',
        color: 'grey',
        fill: 'pattern',
      },
    }]);
  }

  public addMultisig(x: number, y: number) {
    this.editor.createShapes([{
      id: this.editor.generateShapeId(),
      type: 'geo',
      x,
      y,
      props: {
        geo: 'rhombus',
        w: 200,
        h: 200,
        text: 'Multisig (M-of-N)',
        color: 'red',
        fill: 'semi',
      },
    }]);
  }

  public addOracle(x: number, y: number) {
    this.editor.createShapes([{
      id: this.editor.generateShapeId(),
      type: 'geo',
      x,
      y,
      props: {
        geo: 'star',
        w: 200,
        h: 200,
        text: 'Oracle (Price Feed)',
        color: 'violet',
        fill: 'semi',
      },
    }]);
  }

  public clearCanvas() {
    const shapeIds = Array.from(this.editor.getShapePageBounds().keys()) as TLShapeId[];
    this.editor.deleteShapes(shapeIds);
  }

  public exportAsPNG() {
    this.editor.exportAs([]);
  }
}
