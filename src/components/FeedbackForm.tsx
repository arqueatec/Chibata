import { ActionForm, SubmitButton } from "./ActionForm";
import { createFeedback } from "@/app/actions/feedback";

/** Formulário de feedback vinculado a um dia (check-in), tarefa ou período. */
export function FeedbackForm({
  targetUserId,
  checkInId,
  taskId,
  periodType,
  periodStart,
  compact = false,
}: {
  targetUserId: string;
  checkInId?: string;
  taskId?: string;
  periodType?: "WEEK" | "MONTH";
  periodStart?: string;
  compact?: boolean;
}) {
  return (
    <ActionForm action={createFeedback} resetOnSuccess className="space-y-2">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      {checkInId && <input type="hidden" name="checkInId" value={checkInId} />}
      {taskId && <input type="hidden" name="taskId" value={taskId} />}
      {periodType && <input type="hidden" name="periodType" value={periodType} />}
      {periodStart && <input type="hidden" name="periodStart" value={periodStart} />}
      <textarea name="body" required maxLength={2000} rows={compact ? 2 : 3} className="input" placeholder="Escreva um comentário ou reconhecimento…" aria-label="Feedback" />
      <div className="flex flex-wrap items-center gap-2">
        <select name="kind" className="input !w-auto" aria-label="Tipo de feedback">
          <option value="COMMENT">Comentário</option>
          <option value="RECOGNITION">Reconhecimento ⭐</option>
        </select>
        <SubmitButton className="btn-primary btn-sm" pendingText="Enviando…">Registrar feedback</SubmitButton>
      </div>
    </ActionForm>
  );
}
