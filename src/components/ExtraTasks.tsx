"use client";

import { useState } from "react";

/** Linhas de "demanda extra" no check-in: cada uma vira uma tarefa já concluída no dia. */
export function ExtraTasks({ projects, asanaHint }: { projects: { id: string; name: string; asana: boolean }[]; asanaHint: boolean }) {
  const [rows, setRows] = useState<number[]>([]);
  const [next, setNext] = useState(0);
  const add = () => {
    setRows((r) => [...r, next]);
    setNext((n) => n + 1);
  };
  return (
    <div className="space-y-2">
      {rows.map((key) => (
        <div key={key} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[1fr_11rem_auto]">
          <input name="extraTitle" required maxLength={200} placeholder="O que você fez (ex.: Atender visita técnica da UFPE)" className="input" aria-label="Demanda extra" />
          <select name="extraProject" defaultValue="" className="input" aria-label="Projeto">
            <option value="">Sem projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.asana ? " (Asana)" : ""}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRows((r) => r.filter((k) => k !== key))} aria-label="Remover">
            ✕
          </button>
          <input name="extraEvidence" type="url" placeholder="Link da evidência (opcional): Drive, foto, documento…" className="input sm:col-span-3" aria-label="Evidência" />
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={add}>
        + Demanda extra (surgiu hoje e já foi feita)
      </button>
      {asanaHint && rows.length > 0 && <p className="hint">Escolhendo um projeto do Asana, a demanda também é criada lá, já concluída.</p>}
    </div>
  );
}
