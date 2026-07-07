'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { auth as firebaseAuth } from '@/lib/firebase';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
} from 'firebase/auth';

type Step = 'phone' | 'verify';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

const countries = [
  { code: '+91', label: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+1', label: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+44', label: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', label: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+971', label: 'AE', flag: '🇦🇪', name: 'UAE' },
];

const isFirebaseConfigured = !!(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) return digits;
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 5) {
    groups.push(digits.slice(i, i + 5));
  }
  return groups.join(' ');
}

function VerificationCodeInput({
  onComplete,
  disabled,
}: {
  onComplete: (code: string) => void;
  disabled?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '');
    if (!digit) return;
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === CODE_LENGTH - 1 && next.every((d) => d !== '')) {
      onComplete(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
    if (pasted.length === CODE_LENGTH && next.every((d) => d !== '')) {
      onComplete(next.join(''));
    }
  };

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste} role="group" aria-label="Verification code input">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoComplete={i === 0 ? 'one-time-code' : undefined}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="h-12 w-11 rounded-lg border border-gray-300 text-center text-lg font-semibold text-gray-900 shadow-sm outline-none transition focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
      ))}
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = countries.find((c) => c.code === countryCode) ?? countries[0];

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [status, router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCountryPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
      recaptchaRef.current?.clear();
    };
  }, []);

  useEffect(() => {
    if (step === 'phone' && phoneInputRef.current) {
      phoneInputRef.current.focus();
    }
  }, [step]);

  const startResendTimer = () => {
    setResendCountdown(RESEND_COOLDOWN);
    resendTimerRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const validatePhone = (num: string) => {
    if (num.length < 10) return 'Please enter a valid phone number';
    if (num.length > 15) return 'Phone number is too long';
    return null;
  };

  const setupRecaptcha = (): RecaptchaVerifier => {
    if (!recaptchaRef.current && formRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, formRef.current, {
        size: 'invisible',
      });
    }
    if (!recaptchaRef.current) throw new Error('Failed to initialize reCAPTCHA');
    return recaptchaRef.current;
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validatePhone(phoneNumber);
    if (error) {
      setPhoneError(error);
      return;
    }
    setPhoneError(null);
    setIsLoading(true);

    try {
      const recaptcha = setupRecaptcha();
      const fullPhone = `${countryCode}${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(firebaseAuth, fullPhone, recaptcha);
      confirmationRef.current = confirmation;
      startResendTimer();
      setStep('verify');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('too many requests')) {
        setPhoneError('Too many requests. Please try again later.');
      } else if (!message) {
        setPhoneError('Failed to send verification code. Please check the number.');
      } else {
        setPhoneError('Failed to send verification code. Please check the number and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationComplete = async (code: string) => {
    if (!confirmationRef.current) return;
    setIsVerifying(true);
    setCodeError(null);

    try {
      await confirmationRef.current.confirm(code);
      const firebaseUser = firebaseAuth.currentUser;
      if (!firebaseUser) throw new Error('No Firebase user');

      const idToken = await firebaseUser.getIdToken();
      const fullPhone = `${countryCode}${phoneNumber}`;

      const result = await signIn('phone', {
        idToken,
        phone: fullPhone,
        redirect: false,
      });

      if (result?.error) {
        setCodeError('Failed to create session. Please try again.');
        setIsVerifying(false);
        return;
      }

      window.location.href = '/';
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Auth] Verification error:', err);
      }
      setCodeError('Invalid verification code. Please try again.');
      setIsVerifying(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setCodeError(null);
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setIsLoading(true);
    setCodeError(null);

    try {
      const recaptcha = setupRecaptcha();
      const fullPhone = `${countryCode}${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(firebaseAuth, fullPhone, recaptcha);
      confirmationRef.current = confirmation;
      startResendTimer();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('too many requests')) {
        setCodeError('Too many requests. Please try again later.');
      } else {
        setCodeError('Failed to resend verification code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isDev = process.env.NODE_ENV === 'development';

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </main>
    );
  }

  if (status === 'authenticated') {
    return null;
  }

  if (!isFirebaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-sm">
          <h1 className="mb-1 text-3xl font-bold text-gray-900">Evia</h1>
          <p className="mb-4 text-gray-500">Therapist Portal</p>
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            Phone sign-in is currently unavailable. Please contact your administrator.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center bg-gray-50 ${
        isDev ? 'pt-8' : ''
      }`}
    >
      {isDev && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 px-4 py-1.5 text-center text-xs text-gray-300">
          Dev build — use Firebase test numbers
        </div>
      )}
      <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-1 text-3xl font-bold text-gray-900">Evia</h1>
        <p className="mb-8 text-gray-500">Therapist Portal</p>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} ref={formRef} className="text-left">
            <label htmlFor="phone-input" className="mb-1 block text-sm font-medium text-gray-700">
              Phone number
            </label>
            <div className="flex gap-2">
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setShowCountryPicker(!showCountryPicker)}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm shadow-sm transition hover:bg-gray-50"
                  aria-label={`Country code: ${selectedCountry.name} (${selectedCountry.code})`}
                  aria-haspopup="listbox"
                  aria-expanded={showCountryPicker}
                >
                  <span role="img" aria-label={selectedCountry.name}>
                    {selectedCountry.flag}
                  </span>
                  <span className="text-gray-700">{selectedCountry.code}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-400"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {showCountryPicker && (
                  <div
                    className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                    role="listbox"
                    aria-label="Select country code"
                  >
                    {countries.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        role="option"
                        aria-selected={c.code === countryCode}
                        onClick={() => {
                          setCountryCode(c.code);
                          setShowCountryPicker(false);
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-gray-50 ${
                          c.code === countryCode ? 'bg-gray-50 font-medium' : 'text-gray-700'
                        }`}
                      >
                        <span role="img" aria-label={c.name}>
                          {c.flag}
                        </span>
                        <span className="text-gray-900">{c.name}</span>
                        <span className="ml-auto text-gray-500">{c.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                id="phone-input"
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={formatPhone(phoneNumber)}
                onChange={(e) => {
                  setPhoneNumber(e.target.value.replace(/\D/g, ''));
                  if (phoneError) setPhoneError(null);
                }}
                onBlur={() => {
                  if (phoneNumber.length > 0 && phoneNumber.length < 10) {
                    setPhoneError('Please enter a valid 10-digit phone number');
                  }
                }}
                placeholder="Enter phone number"
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? 'phone-error' : undefined}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition ${
                  phoneError
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-gray-300 focus:border-gray-400'
                }`}
              />
            </div>
            {phoneError && (
              <p id="phone-error" className="mt-1 text-xs text-red-600" role="alert">
                {phoneError}
              </p>
            )}
            <button
              type="submit"
              disabled={phoneNumber.length < 10 || isLoading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {isLoading ? 'Sending...' : 'Send verification code'}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <div className="text-left">
            <button
              type="button"
              onClick={handleBack}
              className="mb-4 flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>
            <p className="mb-1 text-sm font-medium text-gray-700">
              Enter verification code
            </p>
            <p className="mb-6 text-xs text-gray-500">
              Sent to {countryCode} {formatPhone(phoneNumber)}
            </p>

            <VerificationCodeInput
              onComplete={handleVerificationComplete}
              disabled={isVerifying}
            />

            {isVerifying && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500" aria-live="polite">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Verifying...
              </div>
            )}

            {codeError && (
              <p className="mt-3 text-center text-xs text-red-600" role="alert">
                {codeError}
              </p>
            )}

            <p className="mt-6 text-center text-xs text-gray-400">
              Didn&apos;t receive the code?{' '}
              {resendCountdown > 0 ? (
                <span className="text-gray-400">Resend in {resendCountdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading}
                  className="text-gray-600 underline transition hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Sending...' : 'Send again'}
                </button>
              )}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
