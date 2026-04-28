import { useEffect, useRef, useState } from "react";

interface PinDialogProps {
  mode: "unlock" | "set";
  externalError?: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}

export function PinDialog({ mode, externalError, onConfirm, onCancel }: PinDialogProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isConfirmStep = mode === "set" && step === "confirm";

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [step]);

  const displayedError = localError || externalError || "";

  function handleSubmit() {
    if (mode === "unlock") {
      if (pin.length < 4) { setLocalError("PIN must be at least 4 digits"); return; }
      onConfirm(pin);
    } else if (step === "enter") {
      if (pin.length < 4) { setLocalError("PIN must be at least 4 digits"); return; }
      setLocalError("");
      setStep("confirm");
    } else {
      if (confirmPin !== pin) { setLocalError("PINs don't match"); return; }
      onConfirm(pin);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80 mx-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {mode === "unlock" ? "Unlock thought" : isConfirmStep ? "Confirm PIN" : "Lock thought"}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {mode === "unlock"
                ? "Enter your PIN to view"
                : isConfirmStep
                ? "Re-enter PIN to confirm"
                : "Set a 4+ digit PIN"}
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={isConfirmStep ? confirmPin : pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 8);
            if (isConfirmStep) setConfirmPin(v);
            else setPin(v);
            setLocalError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
          placeholder="••••"
          className="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 mb-2"
        />

        <div className="h-5 mb-1 flex items-center justify-center">
          {displayedError && (
            <p className="text-xs text-red-500 dark:text-red-400">{displayedError}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
          >
            {mode === "unlock" ? "Unlock" : isConfirmStep ? "Set PIN" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
