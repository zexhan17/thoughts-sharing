import { useEffect, useRef, useState } from "react";

interface PinDialogProps {
  mode: "unlock" | "set" | "change-verify" | "change-new";
  externalError?: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  onChangePinRequest?: () => void;
}

const HEADER: Record<PinDialogProps["mode"], { title: string; subtitle: string }> = {
  "unlock":        { title: "Unlock vault",     subtitle: "Enter your PIN to access protected thoughts" },
  "set":           { title: "Set vault PIN",    subtitle: "Protect thoughts with a 4-digit PIN" },
  "change-verify": { title: "Change vault PIN", subtitle: "Enter your current PIN" },
  "change-new":    { title: "Change vault PIN", subtitle: "Enter your new PIN" },
};

export function PinDialog({ mode, externalError, onConfirm, onCancel, onChangePinRequest }: PinDialogProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isSetMode = mode === "set" || mode === "change-new";
  const isConfirmStep = isSetMode && step === "confirm";
  const currentPin = isConfirmStep ? confirmPin : pin;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [step]);

  const displayedError = localError || externalError || "";

  function submitWithPin(value: string) {
    setLocalError("");
    if (!isSetMode) {
      onConfirm(value);
    } else if (step === "enter") {
      setConfirmPin("");
      setStep("confirm");
    } else {
      if (value !== pin) {
        setLocalError("PINs don't match");
        setConfirmPin("");
        return;
      }
      onConfirm(pin);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (isConfirmStep) setConfirmPin(v); else setPin(v);
    setLocalError("");
    if (v.length === 4) {
      setTimeout(() => submitWithPin(v), 150);
    }
  }

  const { title, subtitle } = HEADER[mode];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80 mx-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {isConfirmStep ? "Confirm PIN" : title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isConfirmStep ? "Re-enter PIN to confirm" : subtitle}
            </p>
          </div>
        </div>

        {/* 4-dot PIN indicator + invisible input overlay */}
        <div className="relative my-2">
          <div
            className="flex gap-5 justify-center py-5 cursor-text"
            onClick={() => inputRef.current?.focus()}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-100 ${
                  currentPin.length > i
                    ? "bg-violet-600 dark:bg-violet-400 scale-110"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={currentPin}
            onChange={handleChange}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-text"
            aria-label={isConfirmStep ? "Confirm PIN" : "Enter PIN"}
            autoComplete="off"
          />
        </div>

        {/* Error */}
        <div className="h-5 mb-3 flex items-center justify-center">
          {displayedError && (
            <p className="text-xs text-red-500 dark:text-red-400">{displayedError}</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => submitWithPin(currentPin)}
            disabled={currentPin.length < 4}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {!isSetMode ? "Unlock" : isConfirmStep ? "Set PIN" : "Next"}
          </button>
        </div>

        {/* Change PIN link — only in unlock mode */}
        {mode === "unlock" && onChangePinRequest && (
          <button
            onClick={onChangePinRequest}
            className="w-full mt-3 text-xs text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          >
            Change PIN?
          </button>
        )}
      </div>
    </div>
  );
}
