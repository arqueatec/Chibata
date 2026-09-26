import type { ScoreResult } from "@/lib/domain/scoring";
import { formatNumber, formatScore, formatValue } from "@/lib/format";
import { ProgressBar, ScorePill } from "./ui";

/** Mostra, de forma transparente, como cada indicador e seu peso contribuíram para a nota. */
export function ScoreBreakdown({ result }: { result: ScoreResult }) {
  if (result.score === null) return <p className="text-sm text-slate-500">Período ainda sem dias úteis a considerar.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Nota: <ScorePill value={result.score} />
        </span>
        <span className="text-slate-600">
          Meta atingida: <strong>{formatScore(result.goalAttainment)}%</strong>
        </span>
        <span className="text-slate-600">
          Check-ins: <strong>{result.checkinsDone}</strong> de {result.countedBusinessDays} dias úteis
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Nota = {formatNumber(result.effectiveIndicatorsWeight)}% × atingimento ponderado dos indicadores + {formatNumber(result.effectiveCheckinWeight)}% ×
        regularidade de check-in. Cada indicador é limitado a 100% na nota (o valor bruto aparece entre parênteses).
      </p>
      <div className="-mx-2 overflow-x-auto">
        <table className="tbl min-w-[560px]">
          <thead>
            <tr>
              <th>Indicador</th>
              <th className="text-right">Realizado</th>
              <th className="text-right">Meta no período</th>
              <th className="w-32">Atingimento</th>
              <th className="text-right">Peso</th>
              <th className="text-right">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {result.indicators.map((i) => (
              <tr key={i.id} title={i.explanation}>
                <td>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-slate-500">
                    {i.direction === "LOWER_BETTER" ? "menor é melhor · meta = máximo" : "maior é melhor"}
                    {i.aggregation === "LAST" ? " · último valor" : ""}
                  </div>
                </td>
                <td className="text-right">{formatValue(i.actual, i.unit)}</td>
                <td className="text-right">{formatValue(i.target, i.unit)}</td>
                <td>
                  <ProgressBar value={i.attainment * 100} />
                  <div className="mt-0.5 text-xs text-slate-600">
                    {formatScore(i.attainment * 100)}%{i.rawAttainment > i.attainment ? ` (${formatScore(i.rawAttainment * 100)}%)` : ""}
                  </div>
                </td>
                <td className="text-right">{formatScore(i.normalizedWeight * result.effectiveIndicatorsWeight)}%</td>
                <td className="text-right font-semibold">{formatScore(i.contribution)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <div className="font-medium">Regularidade de check-in</div>
                <div className="text-xs text-slate-500">dias úteis com check-in</div>
              </td>
              <td className="text-right">{result.checkinsDone}</td>
              <td className="text-right">{result.countedBusinessDays}</td>
              <td>
                <ProgressBar value={result.checkinRate} />
                <div className="mt-0.5 text-xs text-slate-600">{formatScore(result.checkinRate)}%</div>
              </td>
              <td className="text-right">{formatScore(result.effectiveCheckinWeight)}%</td>
              <td className="text-right font-semibold">{formatScore(result.checkinContribution)}</td>
            </tr>
            <tr className="bg-slate-50">
              <td colSpan={5} className="text-right font-semibold">
                Nota do período
              </td>
              <td className="text-right text-base font-bold">{formatScore(result.score)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
