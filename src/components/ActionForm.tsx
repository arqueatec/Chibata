"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";

export type ActionResult = { ok: boolean; message: string; fieldErrors?: Record<string, string> } | null;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext<{ pending: boolean; submitter: string | null }>({ pending: false, submitter: null });

/**
 * Formulário com server action, exibindo mensagens de erro/sucesso retornadas pelo servidor.
 * O envio é feito manualmente (em vez de <form action>) para que o React não limpe os campos
 * quando o servidor rejeita os dados — assim a pessoa não perde o que digitou.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const submitterRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        submitterRef.current = submitter?.value ?? null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => dispatch(fd));
      }}
    >
      <PendingContext.Provider value={{ pending, submitter: submitterRef.current }}>{children}</PendingContext.Provider>
      {state?.message && (
        <p role="status" aria-live="polite" className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Salvando…",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending, submitter } = useContext(PendingContext);
  const mine = pending && (value === undefined || submitter === null || submitter === value);
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {mine ? pendingText : children}
    </button>
  );
}
