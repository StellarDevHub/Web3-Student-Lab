"use client";

import { useState } from "react";

export function WasmDecompilerInspector() {
  const [file, setFile] = useState<File | null>(null);
  const [disassembly, setDisassembly] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    try {
      // Mock disassembly - would use actual WASM decompiler
      const mockDisasm = [
        "00000000: 0061 736d 0100 0000  0106 017f 027f 037f  .asm............",
        "00000010: 0130 0000 0000 0201  0444 4d45 4d4f 0003  .0.......DMEMO..",
        "00000020: 0001 0004 0001 0000  0005 0301 0001 0006  ................",
        "00000030: 1501 027f 0080 0080  8000 000b 0701 000a  ................",
      ].join("\n");
      setDisassembly(mockDisasm);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-semibold mb-4">WASM Decompiler & Disassembly Inspector</h2>
      <div className="space-y-3">
        <input type="file" accept=".wasm" onChange={handleFileChange} className="block w-full" />
        <button
          onClick={analyze}
          disabled={!file || analyzing}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Analyze WASM"}
        </button>
      </div>
      {disassembly && (
        <pre className="mt-4 p-3 bg-gray-900 text-green-400 text-xs overflow-auto rounded max-h-96">
          {disassembly}
        </pre>
      )}
    </div>
  );
}
