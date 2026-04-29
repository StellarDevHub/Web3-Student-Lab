import * as monaco from 'monaco-editor';

export interface Diagnostic {
  message: string;
  severity: monaco.MarkerSeverity;
  range: monaco.IRange;
}

export class DiagnosticsManager {
  private markers: monaco.editor.IMarkerData[] = [];

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

  public setDiagnostics(diagnostics: Diagnostic[]) {
    this.markers = diagnostics.map(d => ({
      message: d.message,
      severity: d.severity,
      startLineNumber: d.range.startLineNumber,
      startColumn: d.range.startColumn,
      endLineNumber: d.range.endLineNumber,
      endColumn: d.range.endColumn,
    }));

    const model = this.editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'lsp', this.markers);
    }
  }

  public clearDiagnostics() {
    const model = this.editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'lsp', []);
    }
    this.markers = [];
  }
}
