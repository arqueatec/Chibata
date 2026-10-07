"use client";

import { startTransition, useActionState, useRef } from "react";
import { runCargaMetas } from "@/app/actions/carga";

/** Formulário próprio (em vez do ActionForm) para exibir o relatório com quebras de linha. */
export function CargaForm() {
  const [state, dispatch, pending] = useActionState(runCargaMetas, null);
  const modoRef = useRef<string>("simular");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        modoRef.current = String(fd.get("modo") ?? "simular");
        if (modoRef.current === "aplicar") {
          const limpar = fd.get("limparDemo") === "on";
          const msg = limpar
            ? "Gravar a carga E APAGAR todos os check-ins, lançamentos, tarefas e revisões existentes? Isso não pode ser desfeito."
            : "Gravar a carga no banco?";
          if (!window.confirm(msg)) return;
        }
        startTransition(() => dispatch(fd));
      }}
    >
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="limparDemo" className="mt-0.5 h-5 w-5" />
        <span>
          <strong>Limpar os dados de demonstração</strong>: apaga todos os check-ins, lançamentos de indicadores, tarefas, feedbacks e revisões e
          recomeça as notas a partir de hoje. Só funciona se o banco ainda tiver os e-mails fictícios da demonstração. Não distingue registros reais
          dos fictícios.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="modo" value="simular" className="btn-secondary" disabled={pending}>
          {pending && modoRef.current === "simular" ? "Simulando…" : "Simular"}
        </button>
        <button type="submit" name="modo" value="aplicar" className="btn-primary" disabled={pending}>
          {pending && modoRef.current === "aplicar" ? "Gravando…" : "Aplicar"}
        </button>
      </div>
      {state?.message && (
        <pre
          role="status"
          aria-live="polite"
          className={`max-h-[32rem] overflow-auto rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${state.ok ? "bg-slate-50 text-slate-800" : "bg-red-50 text-red-800"}`}
        >
          {state.message}
        </pre>
      )}
    </form>
  );
}
