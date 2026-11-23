import { render, screen } from "@testing-library/react";
import { WasmDecompilerInspector } from "../WasmDecompilerInspector";

describe("WasmDecompilerInspector", () => {
  it("renders decompiler interface", () => {
    render(<WasmDecompilerInspector />);
    expect(screen.getByText(/WASM Decompiler/i)).toBeInTheDocument();
  });
});
