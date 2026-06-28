"use client";

import { useId, useMemo, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { clsx } from "clsx";

import { KNOWN_TOKENS, getTokenDisplayName, getTokensByNetwork } from "@/lib/token-constants";

export interface TokenPickerProps {
  value: string;
  onChange: (token: string) => void;
  network: string | null;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

function shortContract(contractId: string) {
  return `${contractId.slice(0, 6)}…${contractId.slice(-6)}`;
}

export function TokenPicker({
  value,
  onChange,
  network,
  disabled = false,
  required = false,
  error,
}: TokenPickerProps) {
  const selectId = useId();
  const customInputId = useId();
  const availableTokens = useMemo(() => getTokensByNetwork(network), [network]);
  const selectedToken = useMemo(
    () => KNOWN_TOKENS.find((token) => token.id === value),
    [value],
  );
  const [isCustom, setIsCustom] = useState(Boolean(value && !selectedToken));
  const [customToken, setCustomToken] = useState(selectedToken ? "" : value);
  const selectedValue = isCustom || (value && !selectedToken) ? "custom" : value;
  const tokenForValidation = isCustom ? customToken : value;
  const isCustomValid =
    !tokenForValidation ||
    StrKey.isValidEd25519PublicKey(tokenForValidation) ||
    StrKey.isValidContract(tokenForValidation);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    if (nextValue === "custom") {
      setIsCustom(true);
      setCustomToken(selectedToken ? "" : value);
      return;
    }

    setIsCustom(false);
    setCustomToken("");
    onChange(nextValue);
  };

  const handleCustomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setCustomToken(nextValue);
    onChange(nextValue);
  };

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="space-y-2">
        <label
          htmlFor={selectId}
          className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted px-1"
        >
          Asset Token
          {required && <span className="ml-1 text-red-400">*</span>}
        </label>
        <select
          id={selectId}
          value={selectedValue}
          onChange={handleSelectChange}
          disabled={disabled}
          className={clsx(
            "glass-input w-full rounded-2xl px-5 py-4 text-sm cursor-pointer",
            error ? "border-red-500/50 bg-red-500/5" : "",
          )}
        >
          <option value="">Select a token…</option>
          {availableTokens.map((token) => (
            <option key={`${token.network}-${token.code}-${token.id}`} value={token.id}>
              {token.code} — {token.name} ({token.network}) · {shortContract(token.id)}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </div>

      {isCustom && (
        <div className="space-y-2">
          <label
            htmlFor={customInputId}
            className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/70 px-1"
          >
            Custom token contract
          </label>
          <input
            id={customInputId}
            type="text"
            value={customToken}
            onChange={handleCustomChange}
            disabled={disabled}
            placeholder="Paste a Stellar contract address, e.g. C…"
            className={clsx(
              "glass-input w-full rounded-2xl px-5 py-4 font-mono text-sm",
              (customToken && !isCustomValid) || error ? "border-red-500/50 bg-red-500/5" : "",
            )}
          />
          {customToken && !isCustomValid && (
            <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
              Enter a valid Stellar token address.
            </p>
          )}
        </div>
      )}

      {value && !isCustom && (
        <div className="rounded-2xl border border-white/5 bg-white/2 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">
            Selected Token
          </p>
          <p className="break-all font-mono text-sm text-ink">{getTokenDisplayName(value)}</p>
        </div>
      )}

      {error && (
        <p className="px-1 text-[10px] font-bold text-red-400 uppercase tracking-tighter">
          {error}
        </p>
      )}
    </div>
  );
}
