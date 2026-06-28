/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TokenPicker } from "../TokenPicker";
import { KNOWN_TOKENS } from "@/lib/token-constants";

describe("TokenPicker", () => {
  it("sets the form value when a preset token is selected", () => {
    const xlm = KNOWN_TOKENS.find(
      (token) => token.code === "XLM" && token.network === "testnet",
    );
    expect(xlm).toBeDefined();

    const handleChange = vi.fn();
    render(
      <TokenPicker
        value=""
        onChange={handleChange}
        network="testnet"
        required
      />,
    );

    fireEvent.change(screen.getByLabelText(/asset token/i), {
      target: { value: xlm!.id },
    });

    expect(handleChange).toHaveBeenCalledWith(xlm!.id);
  });

  it("allows arbitrary custom token input", () => {
    const handleChange = vi.fn();
    render(<TokenPicker value="" onChange={handleChange} network="testnet" />);

    fireEvent.change(screen.getByLabelText(/asset token/i), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText(/custom token contract/i), {
      target: { value: "CUSTOM_TOKEN_CONTRACT" },
    });

    expect(handleChange).toHaveBeenCalledWith("CUSTOM_TOKEN_CONTRACT");
  });
});
